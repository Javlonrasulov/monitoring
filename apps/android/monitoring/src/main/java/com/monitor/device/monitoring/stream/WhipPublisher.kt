package com.monitor.device.monitoring.stream

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import okhttp3.Credentials
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.webrtc.AudioSource
import org.webrtc.AudioTrack
import org.webrtc.Camera1Enumerator
import org.webrtc.Camera2Enumerator
import org.webrtc.CameraVideoCapturer
import org.webrtc.DataChannel
import org.webrtc.DefaultVideoDecoderFactory
import org.webrtc.DefaultVideoEncoderFactory
import org.webrtc.EglBase
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.MediaStream
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RtpReceiver
import org.webrtc.RtpSender
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoCapturer
import org.webrtc.VideoSource
import org.webrtc.VideoTrack
import com.monitor.device.core.model.CameraFacing
import com.monitor.device.monitoring.camera.CameraCapabilityProbe
import java.net.URI
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.coroutines.suspendCoroutine

interface WhipPublisher {
    suspend fun start(
        whipUrl: String,
        bearerToken: String,
        quality: StreamQuality,
        facing: CameraFacing = CameraFacing.FRONT,
    )

    suspend fun stop()

    fun isActive(): Boolean

    fun setTargetBitrate(bitrateBps: Int)

    fun setFacing(facing: CameraFacing, force: Boolean = false)

    fun currentFacing(): CameraFacing
}

/**
 * MediaMTX WHIP publisher using Stream WebRTC (org.webrtc).
 * Capability-based camera selection — no hardcoded device models.
 */
class WhipPublisherImpl(
    private val appContext: Context,
    private val httpClient: OkHttpClient = defaultClient(),
) : WhipPublisher {
    private val active = AtomicBoolean(false)
    private val mainHandler = Handler(Looper.getMainLooper())
    private var resourceUrl: String? = null
    private var sessionToken: String? = null
    private var eglBase: EglBase? = null
    private var factory: PeerConnectionFactory? = null
    private var peerConnection: PeerConnection? = null
    private var videoCapturer: VideoCapturer? = null
    private var surfaceHelper: SurfaceTextureHelper? = null
    private var videoSource: VideoSource? = null
    private var audioSource: AudioSource? = null
    private var videoTrack: VideoTrack? = null
    private var audioTrack: AudioTrack? = null
    private var videoSender: RtpSender? = null

    @Volatile
    private var currentBitrateBps: Int = StreamQuality.MEDIUM.targetBitrateBps

    @Volatile
    private var currentFacing: CameraFacing = CameraFacing.FRONT

    @Volatile
    private var switchingCamera: Boolean = false

    private val publishReady = AtomicBoolean(false)

    private var captureWidth: Int = StreamQuality.MEDIUM.width
    private var captureHeight: Int = StreamQuality.MEDIUM.height
    private var captureFps: Int = StreamQuality.MEDIUM.fps
    private val cameraProbe = CameraCapabilityProbe(appContext)

    override suspend fun start(
        whipUrl: String,
        bearerToken: String,
        quality: StreamQuality,
        facing: CameraFacing,
    ) = withContext(Dispatchers.Main) {
        if (!active.compareAndSet(false, true)) {
            Log.w(TAG, "WHIP publisher already active")
            return@withContext
        }
        currentBitrateBps = quality.targetBitrateBps
        captureWidth = quality.width
        captureHeight = quality.height
        captureFps = quality.fps
        sessionToken = bearerToken
        // A previous session may have died on its own (ICE failure); never leak its natives.
        releasePeer()

        try {
            ensureFactory()
            val pcFactory = factory ?: error("PeerConnectionFactory missing")

            val iceServers = listOf(
                PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer(),
            )
            val rtcConfig = PeerConnection.RTCConfiguration(iceServers).apply {
                sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
                // Non-trickle WHIP: gather once so we post a complete offer, not an 8s timeout mid-gather.
                continualGatheringPolicy = PeerConnection.ContinualGatheringPolicy.GATHER_ONCE
            }

            val gathered = CompletableDeferred<Unit>()
            val pc = pcFactory.createPeerConnection(rtcConfig, connectionObserver(gathered))
                ?: error("Failed to create PeerConnection")
            peerConnection = pc

            val capturer = createCameraCapturer(facing)
                ?: error("No $facing camera available")
            videoCapturer = capturer

            val helper = SurfaceTextureHelper.create("MonitorCapture", eglBase!!.eglBaseContext)
            surfaceHelper = helper
            videoSource = pcFactory.createVideoSource(capturer.isScreencast)
            capturer.initialize(helper, appContext, videoSource!!.capturerObserver)
            startCaptureWithFallback(capturer)

            videoTrack = pcFactory.createVideoTrack("monitor_video", videoSource).apply {
                setEnabled(true)
            }
            audioSource = pcFactory.createAudioSource(MediaConstraints())
            audioTrack = pcFactory.createAudioTrack("monitor_audio", audioSource).apply {
                setEnabled(true)
            }

            videoSender = pc.addTrack(videoTrack, listOf("monitor_stream"))
            pc.addTrack(audioTrack, listOf("monitor_stream"))

            val offer = createOffer(pc)
            setLocalDescription(pc, offer)

            // WHIP here is non-trickle: the offer must already carry the ICE
            // candidates, otherwise MediaMTX has nothing to connect back to.
            withTimeoutOrNull(ICE_GATHER_TIMEOUT_MS) { gathered.await() }
            val offerSdp = pc.localDescription?.description ?: offer.description

            val answerSdp = postWhip(whipUrl, bearerToken, offerSdp)
            setRemoteDescription(
                pc,
                SessionDescription(SessionDescription.Type.ANSWER, answerSdp),
            )
            applyBitrate(currentBitrateBps)
            publishReady.set(true)
            Log.i(TAG, "WHIP publish started path=$whipUrl facing=$currentFacing")
        } catch (t: Throwable) {
            Log.e(TAG, "WHIP start failed: ${t.message}", t)
            publishReady.set(false)
            active.set(false)
            releasePeer()
            throw t
        }
    }

    override suspend fun stop(): Unit = withContext(Dispatchers.Main) {
        // Not guarded by compareAndSet: the ICE observer may have already
        // flipped `active` to false, and the natives still need releasing.
        active.set(false)
        publishReady.set(false)
        val url = resourceUrl
        val token = sessionToken
        resourceUrl = null
        sessionToken = null
        if (!url.isNullOrBlank()) {
            withContext(Dispatchers.IO) {
                runCatching {
                    val builder = Request.Builder().url(url).delete()
                    if (!token.isNullOrBlank()) {
                        builder.header("Authorization", streamCredentials(token))
                    }
                    httpClient.newCall(builder.build()).execute().close()
                }
            }
        }
        releasePeer()
        Log.i(TAG, "WHIP publisher stopped")
    }

    override fun isActive(): Boolean = active.get()

    override fun setTargetBitrate(bitrateBps: Int) {
        mainHandler.post {
            currentBitrateBps = bitrateBps
            applyBitrate(bitrateBps)
        }
    }

    override fun currentFacing(): CameraFacing = currentFacing

    override fun setFacing(facing: CameraFacing, force: Boolean) {
        mainHandler.post {
            if (!publishReady.get() || !active.get()) {
                currentFacing = facing
                return@post
            }
            if (!force && currentFacing == facing) {
                return@post
            }
            switchingCamera = true
            Log.i(TAG, "Camera switch $currentFacing → $facing force=$force; republishing")
            active.set(false)
            publishReady.set(false)
            switchingCamera = false
        }
    }

    private fun applyBitrate(bitrateBps: Int) {
        val sender = videoSender ?: return
        val params = sender.parameters ?: return
        params.encodings?.forEach { encoding ->
            encoding.maxBitrateBps = bitrateBps
        }
        sender.parameters = params
    }

    private fun ensureFactory() {
        if (factory != null) return
        PeerConnectionFactory.initialize(
            PeerConnectionFactory.InitializationOptions.builder(appContext)
                .setEnableInternalTracer(false)
                .createInitializationOptions(),
        )
        eglBase = EglBase.create()
        val encoderFactory = DefaultVideoEncoderFactory(eglBase!!.eglBaseContext, true, true)
        val decoderFactory = DefaultVideoDecoderFactory(eglBase!!.eglBaseContext)
        factory = PeerConnectionFactory.builder()
            .setVideoEncoderFactory(encoderFactory)
            .setVideoDecoderFactory(decoderFactory)
            .createPeerConnectionFactory()
    }

    /**
     * Open the requested lens by Camera2 id. Camera1 first often reports FRONT
     * while capturing the back sensor on Samsung (A-series).
     */
    private fun createCameraCapturer(facing: CameraFacing): VideoCapturer? {
        logCameraInventory()
        createCamera2Capturer(facing)?.let { return it }
        createCamera1Capturer(facing)?.let { return it }
        Log.e(TAG, "No capturer available for $facing")
        return null
    }

    private fun createCamera1Capturer(facing: CameraFacing): VideoCapturer? {
        val enumerator = Camera1Enumerator(true)
        val names = enumerator.deviceNames
        val match = names.firstOrNull { name ->
            if (facing == CameraFacing.FRONT) enumerator.isFrontFacing(name)
            else enumerator.isBackFacing(name)
        } ?: return null
        val capturer = enumerator.createCapturer(match, cameraEvents()) ?: return null
        currentFacing = facing
        Log.i(TAG, "Camera1 capturer $match facing=$facing")
        return capturer
    }

    private fun createCamera2Capturer(facing: CameraFacing): VideoCapturer? {
        val probeFacing = if (facing == CameraFacing.FRONT) {
            CameraCapabilityProbe.LensFacing.FRONT
        } else {
            CameraCapabilityProbe.LensFacing.BACK
        }
        val enumerator = Camera2Enumerator(appContext)
        for (id in cameraProbe.pickCameraIds(probeFacing)) {
            val capturer = enumerator.createCapturer(id, cameraEvents()) ?: continue
            currentFacing = facing
            Log.i(TAG, "Camera2 capturer $id facing=$facing")
            return capturer
        }
        Log.e(TAG, "No Camera2 capturer for $facing")
        return null
    }

    private fun startCaptureWithFallback(capturer: VideoCapturer) {
        val attempts = listOf(
            Triple(captureWidth, captureHeight, captureFps),
            Triple(1280, 720, 24),
            Triple(960, 720, 20),
            Triple(640, 480, 15),
        ).distinct()
        var lastError: Throwable? = null
        for ((width, height, fps) in attempts) {
            try {
                capturer.startCapture(width, height, fps)
                Log.i(TAG, "Capture started ${width}x${height}@$fps facing=$currentFacing")
                return
            } catch (error: Throwable) {
                lastError = error
                Log.w(TAG, "startCapture ${width}x${height}@$fps failed: ${error.message}")
            }
        }
        throw lastError ?: IllegalStateException("startCapture failed")
    }

    private fun logCameraInventory() {
        val enumerator = Camera2Enumerator(appContext)
        val summary = enumerator.deviceNames.joinToString { name ->
            val facing = when {
                enumerator.isFrontFacing(name) -> "FRONT"
                enumerator.isBackFacing(name) -> "BACK"
                else -> "OTHER"
            }
            "$name:$facing"
        }
        Log.i(TAG, "Camera2 devices: $summary")
    }

    private fun cameraEvents() = object : CameraVideoCapturer.CameraEventsHandler {
        override fun onCameraError(errorDescription: String?) {
            Log.e(TAG, "Camera error: $errorDescription")
            if (active.compareAndSet(true, false)) {
                publishReady.set(false)
            }
        }

        override fun onCameraDisconnected() {
            Log.w(TAG, "Camera disconnected")
            if (active.compareAndSet(true, false)) {
                publishReady.set(false)
            }
        }

        override fun onCameraFreezed(errorDescription: String?) {
            Log.w(TAG, "Camera frozen: $errorDescription")
        }

        override fun onCameraOpening(cameraName: String?) {
            Log.i(TAG, "Camera opening $cameraName")
        }

        override fun onFirstFrameAvailable() {
            Log.i(TAG, "First camera frame facing=$currentFacing")
        }

        override fun onCameraClosed() {
            Log.i(TAG, "Camera closed")
        }
    }

    private suspend fun postWhip(
        whipUrl: String,
        bearerToken: String,
        offerSdp: String,
    ): String = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url(whipUrl)
            .header("Authorization", streamCredentials(bearerToken))
            .header("Content-Type", "application/sdp")
            .post(offerSdp.toRequestBody("application/sdp".toMediaType()))
            .build()

        httpClient.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                error("WHIP POST failed: HTTP ${response.code}")
            }
            // MediaMTX answers with a relative Location (the session resource).
            resourceUrl = response.header("Location")?.let { location ->
                runCatching { URI(whipUrl).resolve(location).toString() }.getOrDefault(location)
            }
            response.body?.string().orEmpty().ifBlank {
                error("Empty WHIP answer")
            }
        }
    }

    private suspend fun createOffer(pc: PeerConnection): SessionDescription =
        suspendCoroutine { cont ->
            pc.createOffer(
                object : SdpObserver {
                    override fun onCreateSuccess(desc: SessionDescription?) {
                        if (desc != null) cont.resume(desc) else {
                            cont.resumeWithException(IllegalStateException("Null offer"))
                        }
                    }

                    override fun onCreateFailure(error: String?) {
                        cont.resumeWithException(IllegalStateException(error ?: "createOffer failed"))
                    }

                    override fun onSetSuccess() = Unit
                    override fun onSetFailure(error: String?) = Unit
                },
                MediaConstraints().apply {
                    mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveAudio", "false"))
                    mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveVideo", "false"))
                },
            )
        }

    private suspend fun setLocalDescription(pc: PeerConnection, sdp: SessionDescription) =
        suspendCoroutine { cont ->
            pc.setLocalDescription(
                object : SdpObserver {
                    override fun onSetSuccess() = cont.resume(Unit)
                    override fun onSetFailure(error: String?) {
                        cont.resumeWithException(IllegalStateException(error ?: "setLocal failed"))
                    }

                    override fun onCreateSuccess(p0: SessionDescription?) = Unit
                    override fun onCreateFailure(p0: String?) = Unit
                },
                sdp,
            )
        }

    private suspend fun setRemoteDescription(pc: PeerConnection, sdp: SessionDescription) =
        suspendCoroutine { cont ->
            pc.setRemoteDescription(
                object : SdpObserver {
                    override fun onSetSuccess() = cont.resume(Unit)
                    override fun onSetFailure(error: String?) {
                        cont.resumeWithException(IllegalStateException(error ?: "setRemote failed"))
                    }

                    override fun onCreateSuccess(p0: SessionDescription?) = Unit
                    override fun onCreateFailure(p0: String?) = Unit
                },
                sdp,
            )
        }

    /**
     * Order matters: the peer connection must be closed before the sources it
     * reads from are freed, otherwise libwebrtc dereferences released natives.
     */
    private fun releasePeer() {
        runCatching { videoCapturer?.stopCapture() }
        runCatching { peerConnection?.close() }
        runCatching { videoCapturer?.dispose() }
        videoCapturer = null
        switchingCamera = false
        videoSender = null
        videoTrack = null
        audioTrack = null
        runCatching { videoSource?.dispose() }
        videoSource = null
        runCatching { audioSource?.dispose() }
        audioSource = null
        runCatching { surfaceHelper?.dispose() }
        surfaceHelper = null
        runCatching { peerConnection?.dispose() }
        peerConnection = null
    }

    private fun connectionObserver(gathered: CompletableDeferred<Unit>) = object : PeerConnection.Observer {
        override fun onSignalingChange(state: PeerConnection.SignalingState?) = Unit
        override fun onIceConnectionChange(state: PeerConnection.IceConnectionState?) {
            Log.d(TAG, "ICE connection: $state")
            when (state) {
                // DISCONNECTED is often transient (NAT remap, brief Wi‑Fi blip).
                // Tearing down here made MediaMTX drop the path so viewers froze
                // after 2–3s while the phone kept restarting WHIP.
                PeerConnection.IceConnectionState.FAILED,
                PeerConnection.IceConnectionState.CLOSED,
                -> {
                    if (active.compareAndSet(true, false)) {
                        Log.w(TAG, "Stream dropped (ICE $state), publisher marked inactive")
                    }
                }
                else -> Unit
            }
        }

        override fun onIceConnectionReceivingChange(receiving: Boolean) = Unit
        override fun onIceGatheringChange(state: PeerConnection.IceGatheringState?) {
            if (state == PeerConnection.IceGatheringState.COMPLETE) {
                gathered.complete(Unit)
            }
        }

        override fun onIceCandidate(candidate: IceCandidate?) = Unit
        override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>?) = Unit
        override fun onAddStream(stream: MediaStream?) = Unit
        override fun onRemoveStream(stream: MediaStream?) = Unit
        override fun onDataChannel(dc: DataChannel?) = Unit
        override fun onRenegotiationNeeded() = Unit
        override fun onAddTrack(receiver: RtpReceiver?, streams: Array<out MediaStream>?) = Unit
    }

    companion object {
        private const val TAG = "WhipPublisher"
        private const val ICE_GATHER_TIMEOUT_MS = 8_000L

        /**
         * MediaMTX only forwards HTTP basic credentials to its external auth
         * endpoint, so the short-lived stream token travels as the password.
         */
        fun streamCredentials(streamToken: String): String =
            Credentials.basic("monitor", streamToken)

        fun defaultClient(): OkHttpClient = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .writeTimeout(20, TimeUnit.SECONDS)
            .build()
    }
}
