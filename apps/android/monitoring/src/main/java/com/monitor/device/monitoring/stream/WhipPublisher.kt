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
        facing: CameraFacing = CameraFacing.BACK,
    )

    suspend fun stop()

    fun isActive(): Boolean

    fun setTargetBitrate(bitrateBps: Int)

    fun setFacing(facing: CameraFacing)

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
    private var currentFacing: CameraFacing = CameraFacing.BACK

    @Volatile
    private var switchingCamera: Boolean = false

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
                continualGatheringPolicy = PeerConnection.ContinualGatheringPolicy.GATHER_CONTINUALLY
            }

            val gathered = CompletableDeferred<Unit>()
            val pc = pcFactory.createPeerConnection(rtcConfig, connectionObserver(gathered))
                ?: error("Failed to create PeerConnection")
            peerConnection = pc

            val capturer = createCameraCapturer(facing)
                ?: error("No camera available")
            videoCapturer = capturer

            val helper = SurfaceTextureHelper.create("MonitorCapture", eglBase!!.eglBaseContext)
            surfaceHelper = helper
            videoSource = pcFactory.createVideoSource(capturer.isScreencast)
            capturer.initialize(helper, appContext, videoSource!!.capturerObserver)
            capturer.startCapture(quality.width, quality.height, quality.fps)

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
            Log.i(TAG, "WHIP publish started path=$whipUrl")
        } catch (t: Throwable) {
            Log.e(TAG, "WHIP start failed: ${t.message}", t)
            active.set(false)
            releasePeer()
            throw t
        }
    }

    override suspend fun stop(): Unit = withContext(Dispatchers.Main) {
        // Not guarded by compareAndSet: the ICE observer may have already
        // flipped `active` to false, and the natives still need releasing.
        active.set(false)
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

    override fun setFacing(facing: CameraFacing) {
        mainHandler.post {
            if (!active.get() || currentFacing == facing || switchingCamera) {
                return@post
            }
            val capturer = videoCapturer as? CameraVideoCapturer
            if (capturer == null) {
                Log.w(TAG, "Camera switch skipped: capturer is not CameraVideoCapturer")
                return@post
            }
            switchingCamera = true
            capturer.switchCamera(object : CameraVideoCapturer.CameraSwitchHandler {
                override fun onCameraSwitchDone(isFrontCamera: Boolean) {
                    currentFacing = if (isFrontCamera) CameraFacing.FRONT else CameraFacing.BACK
                    switchingCamera = false
                    Log.i(TAG, "Camera facing now $currentFacing")
                }

                override fun onCameraSwitchError(errorDescription: String?) {
                    switchingCamera = false
                    Log.w(TAG, "Camera switch failed: $errorDescription")
                }
            })
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

    private fun createCameraCapturer(facing: CameraFacing): VideoCapturer? {
        val enumerator = Camera2Enumerator(appContext)
        val deviceNames = enumerator.deviceNames
        val back = deviceNames.firstOrNull { enumerator.isBackFacing(it) }
        val front = deviceNames.firstOrNull { enumerator.isFrontFacing(it) }
        val preferred = if (facing == CameraFacing.FRONT) {
            front ?: back
        } else {
            back ?: front
        }
        val chosen = preferred ?: deviceNames.firstOrNull() ?: return null
        currentFacing = when {
            front != null && chosen == front -> CameraFacing.FRONT
            back != null && chosen == back -> CameraFacing.BACK
            enumerator.isFrontFacing(chosen) -> CameraFacing.FRONT
            else -> CameraFacing.BACK
        }
        Log.i(TAG, "Starting camera $chosen facing=$currentFacing requested=$facing")
        return enumerator.createCapturer(chosen, null)
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
                PeerConnection.IceConnectionState.FAILED,
                PeerConnection.IceConnectionState.DISCONNECTED,
                PeerConnection.IceConnectionState.CLOSED,
                -> {
                    // Surfaces the drop to MonitoringEngine, which re-publishes
                    // with a fresh token instead of silently going dark.
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
