package com.monitor.device.monitoring.camera

import android.content.Context
import android.util.Log
import android.util.Size
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import com.monitor.device.monitoring.stream.StreamQuality
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine

/**
 * CameraX preview + analysis hooks for the monitoring pipeline.
 * Frame delivery to WebRTC encoder is TODO(MediaMTX WHIP).
 */
class CameraStreamController(
    private val context: Context,
) {
    private val started = AtomicBoolean(false)
    private var cameraProvider: ProcessCameraProvider? = null
    private var analysisExecutor: ExecutorService? = null

    var onFrameAnalyzed: ((width: Int, height: Int, timestampNs: Long) -> Unit)? = null

    suspend fun start(
        lifecycleOwner: LifecycleOwner,
        quality: StreamQuality,
        preferFront: Boolean = false,
        previewView: PreviewView? = null,
    ) {
        if (!started.compareAndSet(false, true)) {
            Log.w(TAG, "Camera already started")
            return
        }

        val provider = awaitCameraProvider()
        cameraProvider = provider
        provider.unbindAll()

        val selector = if (preferFront) {
            CameraSelector.DEFAULT_FRONT_CAMERA
        } else {
            CameraSelector.DEFAULT_BACK_CAMERA
        }

        val target = Size(quality.width, quality.height)
        val preview = Preview.Builder()
            .setTargetResolution(target)
            .build()
            .also { useCase ->
                previewView?.let { useCase.setSurfaceProvider(it.surfaceProvider) }
            }

        analysisExecutor = Executors.newSingleThreadExecutor()
        val analysis = ImageAnalysis.Builder()
            .setTargetResolution(target)
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .build()
            .also { useCase ->
                useCase.setAnalyzer(analysisExecutor!!) { imageProxy ->
                    onFrameAnalyzed?.invoke(
                        imageProxy.width,
                        imageProxy.height,
                        imageProxy.imageInfo.timestamp,
                    )
                    // TODO(MediaMTX WHIP): convert YUV frames / CameraX surface to WebRTC VideoTrack
                    imageProxy.close()
                }
            }

        provider.bindToLifecycle(lifecycleOwner, selector, preview, analysis)
        Log.i(TAG, "Camera started at ${quality.width}x${quality.height}")
    }

    fun stop() {
        if (!started.compareAndSet(true, false)) return
        runCatching { cameraProvider?.unbindAll() }
        analysisExecutor?.shutdown()
        analysisExecutor = null
        cameraProvider = null
        Log.i(TAG, "Camera stopped")
    }

    private suspend fun awaitCameraProvider(): ProcessCameraProvider =
        suspendCancellableCoroutine { cont ->
            val future = ProcessCameraProvider.getInstance(context)
            future.addListener(
                {
                    try {
                        cont.resume(future.get())
                    } catch (t: Throwable) {
                        cont.resumeWithException(t)
                    }
                },
                ContextCompat.getMainExecutor(context),
            )
        }

    companion object {
        private const val TAG = "CameraStreamController"
    }
}
