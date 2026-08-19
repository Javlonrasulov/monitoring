package com.monitor.device.monitoring.stream

import android.content.Context
import android.util.Log
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.webrtc.AudioTrack
import org.webrtc.DataChannel
import org.webrtc.DefaultVideoDecoderFactory
import org.webrtc.DefaultVideoEncoderFactory
import org.webrtc.EglBase
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.MediaStream
import org.webrtc.MediaStreamTrack
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RendererCommon
import org.webrtc.RtpReceiver
import org.webrtc.RtpTransceiver
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.SurfaceViewRenderer
import org.webrtc.VideoTrack
import java.net.URI
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.coroutines.suspendCoroutine

class WhepViewer(
    private val appContext: Context,
    private val httpClient: OkHttpClient = defaultClient(),
) {
    private val active = AtomicBoolean(false)
    private var eglBase: EglBase? = null
    private var factory: PeerConnectionFactory? = null
    private var peerConnection: PeerConnection? = null
    private var videoTrack: VideoTrack? = null
    private var audioTrack: AudioTrack? = null
    private var renderer: SurfaceViewRenderer? = null
    private var resourceUrl: String? = null
    private var sessionToken: String? = null

    fun eglContext(): EglBase.Context? = eglBase?.eglBaseContext

    suspend fun start(
        whepUrl: String,
        bearerToken: String,
        audioEnabled: Boolean,
        rendererView: SurfaceViewRenderer,
    ) = withContext(Dispatchers.Main) {
        if (!active.compareAndSet(false, true)) return@withContext
        sessionToken = bearerToken
        renderer = rendererView
        releasePeer(keepFactory = true)
        try {
            ensureFactory()
            rendererView.initForViewer(eglContext())
            val pcFactory = factory ?: error("PeerConnectionFactory missing")
            val iceServers = listOf(
                PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer(),
            )
            val rtcConfig = PeerConnection.RTCConfiguration(iceServers).apply {
                sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
                continualGatheringPolicy =
                    PeerConnection.ContinualGatheringPolicy.GATHER_CONTINUALLY
            }
            val gathered = CompletableDeferred<Unit>()
            val pc = pcFactory.createPeerConnection(rtcConfig, observer(gathered))
                ?: error("Failed to create PeerConnection")
            peerConnection = pc
            pc.addTransceiver(
                MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO,
                RtpTransceiver.RtpTransceiverInit(RtpTransceiver.RtpTransceiverDirection.RECV_ONLY),
            )
            pc.addTransceiver(
                MediaStreamTrack.MediaType.MEDIA_TYPE_AUDIO,
                RtpTransceiver.RtpTransceiverInit(RtpTransceiver.RtpTransceiverDirection.RECV_ONLY),
            )
            val constraints = MediaConstraints().apply {
                mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveVideo", "true"))
                mandatory.add(
                    MediaConstraints.KeyValuePair(
                        "OfferToReceiveAudio",
                        if (audioEnabled) "true" else "false",
                    ),
                )
            }
            val offer = createOffer(pc, constraints)
            setLocal(pc, offer)
            withTimeoutOrNull(8_000) { gathered.await() }
            val offerSdp = pc.localDescription?.description ?: offer.description
            val answerSdp = postWhep(whepUrl, bearerToken, offerSdp)
            setRemote(pc, SessionDescription(SessionDescription.Type.ANSWER, answerSdp))
        } catch (error: Throwable) {
            active.set(false)
            releasePeer(keepFactory = true)
            throw error
        }
    }

    suspend fun stop() = withContext(Dispatchers.Main) {
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
                        builder.header("Authorization", "Bearer $token")
                    }
                    httpClient.newCall(builder.build()).execute().close()
                }
            }
        }
        releasePeer(keepFactory = false)
    }

    private fun attachRemote(track: MediaStreamTrack) {
        when (track) {
            is VideoTrack -> {
                videoTrack?.removeSink(renderer)
                videoTrack = track
                renderer?.let { track.addSink(it) }
                track.setEnabled(true)
            }
            is AudioTrack -> {
                audioTrack = track
                track.setEnabled(true)
            }
        }
    }

    private fun observer(gathered: CompletableDeferred<Unit>) =
        object : PeerConnection.Observer {
            override fun onSignalingChange(state: PeerConnection.SignalingState?) = Unit
            override fun onIceConnectionChange(state: PeerConnection.IceConnectionState?) = Unit
            override fun onIceConnectionReceivingChange(receiving: Boolean) = Unit
            override fun onIceGatheringChange(state: PeerConnection.IceGatheringState?) {
                if (state == PeerConnection.IceGatheringState.COMPLETE && !gathered.isCompleted) {
                    gathered.complete(Unit)
                }
            }
            override fun onIceCandidate(candidate: IceCandidate?) = Unit
            override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>?) = Unit
            override fun onAddStream(stream: MediaStream?) = Unit
            override fun onRemoveStream(stream: MediaStream?) = Unit
            override fun onDataChannel(channel: DataChannel?) = Unit
            override fun onRenegotiationNeeded() = Unit
            override fun onAddTrack(receiver: RtpReceiver?, streams: Array<out MediaStream>?) {
                val track = receiver?.track() ?: return
                attachRemote(track)
            }
        }

    private fun ensureFactory() {
        if (factory != null) return
        runCatching {
            PeerConnectionFactory.initialize(
                PeerConnectionFactory.InitializationOptions.builder(appContext)
                    .setEnableInternalTracer(false)
                    .createInitializationOptions(),
            )
        }
        eglBase = EglBase.create()
        factory = PeerConnectionFactory.builder()
            .setVideoEncoderFactory(DefaultVideoEncoderFactory(eglBase!!.eglBaseContext, true, true))
            .setVideoDecoderFactory(DefaultVideoDecoderFactory(eglBase!!.eglBaseContext))
            .createPeerConnectionFactory()
    }

    private fun releasePeer(keepFactory: Boolean) {
        videoTrack?.removeSink(renderer)
        videoTrack = null
        audioTrack = null
        runCatching { peerConnection?.close() }
        peerConnection = null
        if (!keepFactory) {
            runCatching { factory?.dispose() }
            factory = null
            runCatching { eglBase?.release() }
            eglBase = null
            renderer = null
        }
    }

    private suspend fun postWhep(url: String, token: String, sdp: String): String =
        withContext(Dispatchers.IO) {
            val request = Request.Builder()
                .url(url)
                .header("Authorization", "Bearer $token")
                .header("Content-Type", "application/sdp")
                .post(sdp.toRequestBody("application/sdp".toMediaType()))
                .build()
            httpClient.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    error("WHEP POST failed: HTTP ${response.code}")
                }
                resourceUrl = response.header("Location")?.let { location ->
                    runCatching { URI(url).resolve(location).toString() }.getOrDefault(location)
                }
                response.body?.string().orEmpty().ifBlank { error("Empty WHEP answer") }
            }
        }

    private suspend fun createOffer(pc: PeerConnection, constraints: MediaConstraints) =
        suspendCoroutine<SessionDescription> { cont ->
            pc.createOffer(object : SdpObserver {
                override fun onCreateSuccess(desc: SessionDescription?) {
                    if (desc != null) cont.resume(desc) else {
                        cont.resumeWithException(IllegalStateException("Null offer"))
                    }
                }
                override fun onCreateFailure(error: String?) {
                    cont.resumeWithException(IllegalStateException(error ?: "offer failed"))
                }
                override fun onSetSuccess() = Unit
                override fun onSetFailure(error: String?) = Unit
            }, constraints)
        }

    private suspend fun setLocal(pc: PeerConnection, desc: SessionDescription) =
        suspendCoroutine<Unit> { cont ->
            pc.setLocalDescription(object : SdpObserver {
                override fun onSetSuccess() = cont.resume(Unit)
                override fun onSetFailure(error: String?) {
                    cont.resumeWithException(IllegalStateException(error ?: "setLocal failed"))
                }
                override fun onCreateSuccess(p0: SessionDescription?) = Unit
                override fun onCreateFailure(error: String?) = Unit
            }, desc)
        }

    private suspend fun setRemote(pc: PeerConnection, desc: SessionDescription) =
        suspendCoroutine<Unit> { cont ->
            pc.setRemoteDescription(object : SdpObserver {
                override fun onSetSuccess() = cont.resume(Unit)
                override fun onSetFailure(error: String?) {
                    cont.resumeWithException(IllegalStateException(error ?: "setRemote failed"))
                }
                override fun onCreateSuccess(p0: SessionDescription?) = Unit
                override fun onCreateFailure(error: String?) = Unit
            }, desc)
        }

    companion object {
        fun defaultClient(): OkHttpClient = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .writeTimeout(20, TimeUnit.SECONDS)
            .build()
    }
}

fun SurfaceViewRenderer.initForViewer(egl: EglBase.Context?) {
    if (egl == null) return
    runCatching {
        init(egl, null)
        setScalingType(RendererCommon.ScalingType.SCALE_ASPECT_FIT)
        setEnableHardwareScaler(true)
        setMirror(false)
    }.onFailure { Log.w("WhepViewer", "renderer already initialized") }
}
