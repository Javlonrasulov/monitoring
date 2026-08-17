package com.monitor.device.monitoring

import android.content.Context
import android.util.Log
import androidx.lifecycle.LifecycleOwner
import com.monitor.device.core.api.DeviceApiClient
import com.monitor.device.core.auth.TokenStore
import com.monitor.device.core.model.CameraFacing
import com.monitor.device.core.model.ConnectionStatus
import com.monitor.device.monitoring.audio.AudioCaptureController
import com.monitor.device.monitoring.camera.CameraCapabilityProbe
import com.monitor.device.monitoring.camera.CameraStreamController
import com.monitor.device.monitoring.reconnect.ReconnectManager
import com.monitor.device.monitoring.restriction.OemRestrictionDetector
import com.monitor.device.monitoring.status.DeviceStatusCollector
import com.monitor.device.monitoring.stream.AdaptiveBitrateController
import com.monitor.device.monitoring.stream.StreamQuality
import com.monitor.device.monitoring.stream.WhipPublisher
import com.monitor.device.monitoring.stream.WhipPublisherImpl
import android.os.PowerManager
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Facade that wires camera, audio, WHIP publishing, heartbeat, and reconnect.
 * Prevents duplicate sessions and releases resources on stop.
 */
class MonitoringEngine(
    context: Context,
    private val apiClient: DeviceApiClient,
    private val tokenStore: TokenStore,
    private val whipPublisher: WhipPublisher = WhipPublisherImpl(context.applicationContext),
    private val appVersion: String = "1.0.0",
    private val onFatal: () -> Unit = {},
) {
    private val appContext = context.applicationContext
    private val mutex = Mutex()
    private val running = AtomicBoolean(false)

    private val cameraProbe = CameraCapabilityProbe(appContext)
    private val camera = CameraStreamController(appContext)
    private val audio = AudioCaptureController(appContext)
    private val statusCollector = DeviceStatusCollector(appContext)
    private val restrictionDetector = OemRestrictionDetector(appContext)
    private val adaptive = AdaptiveBitrateController()
    private val reconnect = ReconnectManager()

    private var scope: CoroutineScope? = null
    private var heartbeatJob: Job? = null
    private var cameraPollJob: Job? = null
    private var sessionId: String? = null

    @Volatile
    var lastStatus: ConnectionStatus = ConnectionStatus.OFFLINE
        private set

    @Volatile
    var lastError: String? = null
        private set

    @Volatile
    private var desiredFacing: CameraFacing = CameraFacing.BACK

    @Volatile
    private var skipFacingUntilMs: Long = 0L

    @Volatile
    private var skippedFacing: CameraFacing? = null

    fun isRunning(): Boolean = running.get()

    suspend fun start(
        @Suppress("UNUSED_PARAMETER") lifecycleOwner: LifecycleOwner,
        quality: StreamQuality = StreamQuality.MEDIUM,
    ) = mutex.withLock {
        if (!tokenStore.isPaired()) {
            error("Device must be paired before monitoring")
        }
        if (!running.compareAndSet(false, true)) {
            Log.w(TAG, "Monitoring session already active")
            return@withLock
        }

        lastError = null
        lastStatus = ConnectionStatus.CONNECTING
        adaptive.reset(quality)
        reconnect.reset()

        val engineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        scope = engineScope

        try {
            val selected = cameraProbe.selectBestCamera(
                maxWidth = quality.width,
                maxHeight = quality.height,
            )
            val cameras = cameraProbe.discoverCameras()
            Log.i(
                TAG,
                "Selected camera=${selected?.cameraId} facing=${selected?.lensFacing} total=${cameras.size}",
            )

            lastStatus = ConnectionStatus.CONNECTING
            reportStatus(ConnectionStatus.CONNECTING.name)
            refreshDesiredFacing()
            // Camera/mic capture is owned by WhipPublisher (WebRTC). CameraX is for UI preview only.
            publishWithRetry(engineScope)
            startHeartbeat(engineScope)
            startCameraPoll(engineScope)
        } catch (t: Throwable) {
            lastError = t.message
            lastStatus = ConnectionStatus.ERROR
            running.set(false)
            releaseInternal()
            throw t
        }
    }

    suspend fun stop() = mutex.withLock {
        val wasRunning = running.getAndSet(false)
        if (!wasRunning && scope == null) return@withLock
        if (wasRunning && tokenStore.isPaired()) {
            lastStatus = ConnectionStatus.ONLINE
            runCatching { reportStatus(ConnectionStatus.ONLINE.name) }
        }
        releaseInternal()
    }

    fun setMuted(muted: Boolean) {
        audio.setMuted(muted)
    }

    private suspend fun startPublisher(whipUrl: String, bearerToken: String) {
        try {
            whipPublisher.start(
                whipUrl = whipUrl,
                bearerToken = bearerToken,
                quality = adaptive.quality,
                facing = desiredFacing,
            )
            skippedFacing = null
        } catch (error: Throwable) {
            if (desiredFacing != CameraFacing.FRONT) throw error
            Log.w(TAG, "FRONT camera failed (${error.message}), publishing BACK")
            skippedFacing = CameraFacing.FRONT
            skipFacingUntilMs = System.currentTimeMillis() + 60_000
            whipPublisher.start(
                whipUrl = whipUrl,
                bearerToken = bearerToken,
                quality = adaptive.quality,
                facing = CameraFacing.BACK,
            )
        }
    }

    fun isStreaming(): Boolean =
        running.get() && lastStatus == ConnectionStatus.STREAMING && whipPublisher.isActive()

    private fun publishWithRetry(scope: CoroutineScope) {
        scope.launch {
            while (isActive && running.get()) {
                try {
                    val token = apiClient.publisherToken()
                    sessionId = token.sessionId
                    startPublisher(
                        whipUrl = token.whipUrl,
                        bearerToken = token.token,
                    )
                    if (!whipPublisher.isActive()) {
                        reconnect.awaitNext("whip-inactive")
                        continue
                    }
                    reconnect.reset()
                    lastStatus = ConnectionStatus.STREAMING
                    lastError = null
                    runCatching { reportStatus(ConnectionStatus.STREAMING.name) }
                    // Keep publisher "alive"; real PeerConnection would stay open.
                    while (isActive && running.get() && whipPublisher.isActive()) {
                        val snap = statusCollector.collect()
                        val hot = snap.thermalState in setOf("SEVERE", "CRITICAL", "EMERGENCY")
                        adaptive.onNetworkQuality(snap.networkQuality, hot)
                        whipPublisher.setTargetBitrate(adaptive.currentBitrateBps)

                        val pm = appContext.getSystemService(Context.POWER_SERVICE) as PowerManager
                        val interactive = pm.isInteractive
                        val restriction = restrictionDetector.detectCameraBackgroundRestriction(interactive)
                        if (restriction != null) {
                            // Log only: Samsung FGS still publishes with battery
                            // optimization on. Reporting ERROR here made 51 look
                            // dead in admin while the app was open and streaming.
                            Log.w(TAG, restriction.message)
                        }
                        delay(5_000)
                    }

                    if (isActive && running.get()) {
                        val switchCamera = whipPublisher.currentFacing() != desiredFacing
                        Log.w(TAG, "Stream dropped, republishing camera=$desiredFacing")
                        lastStatus = ConnectionStatus.CONNECTING
                        runCatching { whipPublisher.stop() }
                        if (switchCamera) {
                            reconnect.reset()
                            delay(500)
                        } else {
                            reconnect.awaitNext("stream-dropped")
                        }
                    }
                } catch (unpaired: DeviceApiClient.Unpaired) {
                    handleUnpaired(unpaired)
                    break
                } catch (t: Throwable) {
                    lastError = t.message
                    lastStatus = ConnectionStatus.CONNECTING
                    Log.w(TAG, "Publish failed, will reconnect: ${t.message}")
                    runCatching { whipPublisher.stop() }
                    reconnect.awaitNext("whip-publish")
                }
            }
        }
    }

    private fun startHeartbeat(scope: CoroutineScope) {
        heartbeatJob?.cancel()
        heartbeatJob = scope.launch {
            while (isActive && running.get()) {
                try {
                    reportStatus(
                        if (whipPublisher.isActive()) {
                            ConnectionStatus.STREAMING.name
                        } else {
                            ConnectionStatus.CONNECTING.name
                        },
                    )
                } catch (unpaired: DeviceApiClient.Unpaired) {
                    handleUnpaired(unpaired)
                    break
                } catch (t: Throwable) {
                    Log.w(TAG, "Heartbeat failed: ${t.message}")
                }
                delay(15_000)
            }
        }
    }

    private fun startCameraPoll(scope: CoroutineScope) {
        cameraPollJob?.cancel()
        cameraPollJob = scope.launch {
            while (isActive && running.get()) {
                try {
                    refreshDesiredFacing()
                } catch (unpaired: DeviceApiClient.Unpaired) {
                    handleUnpaired(unpaired)
                    break
                } catch (t: Throwable) {
                    Log.w(TAG, "Camera poll failed: ${t.message}")
                }
                delay(2_000)
            }
        }
    }

    private fun handleUnpaired(unpaired: DeviceApiClient.Unpaired) {
        Log.w(TAG, "Device no longer paired, stopping monitoring")
        lastError = unpaired.message
        lastStatus = ConnectionStatus.ERROR
        running.set(false)
        onFatal()
    }

    private suspend fun reportStatus(
        status: String,
        errorCode: String? = if (lastError != null) "MONITOR_ERROR" else null,
        errorMessage: String? = lastError,
    ) {
        val body = statusCollector.toStatusUpdate(
            status = status,
            appVersion = appVersion,
            errorCode = errorCode,
            errorMessage = errorMessage,
        )
        val response = apiClient.updateStatus(body)
        CameraFacing.from(response.cameraFacing)?.let { desiredFacing = it }
        applyDesiredFacing()
    }

    private suspend fun refreshDesiredFacing() {
        runCatching {
            val me = apiClient.me()
            CameraFacing.from(me.cameraFacing)?.let { desiredFacing = it }
        }.onFailure { error ->
            if (error is DeviceApiClient.Unpaired) throw error
            Log.w(TAG, "Camera facing fetch failed: ${error.message}")
        }
        applyDesiredFacing()
    }

    private fun applyDesiredFacing() {
        if (
            skippedFacing == desiredFacing &&
            System.currentTimeMillis() < skipFacingUntilMs
        ) {
            return
        }
        if (whipPublisher.isActive()) {
            whipPublisher.setFacing(desiredFacing)
        }
    }

    private suspend fun releaseInternal() {
        heartbeatJob?.cancel()
        heartbeatJob = null
        cameraPollJob?.cancel()
        cameraPollJob = null
        scope?.cancel()
        scope = null
        runCatching { whipPublisher.stop() }
        camera.stop()
        audio.stop()
        sessionId = null
        Log.i(TAG, "Monitoring resources released")
    }

    companion object {
        private const val TAG = "MonitoringEngine"
    }
}
