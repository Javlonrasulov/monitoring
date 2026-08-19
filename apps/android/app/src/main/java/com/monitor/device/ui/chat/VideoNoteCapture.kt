package com.monitor.device.ui.chat

import android.annotation.SuppressLint
import android.view.ViewGroup
import androidx.camera.core.CameraSelector
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.FileOutputOptions
import androidx.camera.video.Quality
import androidx.camera.video.QualitySelector
import androidx.camera.video.Recorder
import androidx.camera.video.Recording
import androidx.camera.video.VideoCapture
import androidx.camera.video.VideoRecordEvent
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.monitor.device.R
import com.monitor.device.monitoring.service.MonitoringForegroundService
import kotlinx.coroutines.delay
import java.io.File
import java.util.UUID
import java.util.concurrent.Executor

/**
 * Chat-only round video capture. Uses CameraX in the app module and never
 * touches the live-stream / monitoring camera pipeline.
 */
@SuppressLint("MissingPermission")
@Composable
fun VideoNoteCapture(
    onRecorded: (File, Int) -> Unit,
    onCancel: () -> Unit,
    onBusy: () -> Unit,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    var seconds by remember { mutableIntStateOf(0) }
    var recording by remember { mutableStateOf(false) }
    var active by remember { mutableStateOf<Recording?>(null) }
    var videoCapture by remember { mutableStateOf<VideoCapture<Recorder>?>(null) }
    var cameraReady by remember { mutableStateOf(false) }
    val output = remember {
        File(context.cacheDir, "video-note-${UUID.randomUUID()}.mp4")
    }

    LaunchedEffect(Unit) {
        var waits = 0
        while (MonitoringForegroundService.isStarted() && waits < 30) {
            delay(100)
            waits++
        }
        delay(250)
        cameraReady = true
    }

    LaunchedEffect(recording) {
        if (!recording) return@LaunchedEffect
        seconds = 0
        while (recording && seconds < 60) {
            delay(1000)
            seconds += 1
        }
        if (seconds >= 60) {
            active?.stop()
        }
    }

    var boundProvider by remember { mutableStateOf<ProcessCameraProvider?>(null) }
    var boundPreview by remember { mutableStateOf<Preview?>(null) }
    var boundCapture by remember { mutableStateOf<VideoCapture<Recorder>?>(null) }

    DisposableEffect(Unit) {
        MonitoringForegroundService.pauseForChatCamera(context)
        onDispose {
            active?.stop()
            val provider = boundProvider
            val preview = boundPreview
            val capture = boundCapture
            if (provider != null && preview != null && capture != null) {
                runCatching { provider.unbind(preview, capture) }
            }
            MonitoringForegroundService.resumeAfterChatCamera(context)
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xF20A1211)),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Box(
                modifier = Modifier
                    .size(280.dp)
                    .clip(CircleShape)
                    .border(4.dp, Color(0xFF2DD4BF), CircleShape),
            ) {
                AndroidView(
                    factory = { ctx ->
                        val previewView = PreviewView(ctx).apply {
                            layoutParams = ViewGroup.LayoutParams(
                                ViewGroup.LayoutParams.MATCH_PARENT,
                                ViewGroup.LayoutParams.MATCH_PARENT,
                            )
                            scaleType = PreviewView.ScaleType.FILL_CENTER
                        }
                        previewView
                    },
                    update = labeled@{ previewView ->
                        if (!cameraReady || videoCapture != null) return@labeled
                        val executor: Executor = ContextCompat.getMainExecutor(previewView.context)
                        ProcessCameraProvider.getInstance(previewView.context).addListener(
                            {
                                runCatching {
                                    val provider = ProcessCameraProvider.getInstance(previewView.context).get()
                                    val preview = Preview.Builder().build().also {
                                        it.setSurfaceProvider(previewView.surfaceProvider)
                                    }
                                    val recorder = Recorder.Builder()
                                        .setQualitySelector(QualitySelector.from(Quality.SD))
                                        .build()
                                    val capture = VideoCapture.withOutput(recorder)
                                    provider.bindToLifecycle(
                                        lifecycleOwner,
                                        CameraSelector.DEFAULT_FRONT_CAMERA,
                                        preview,
                                        capture,
                                    )
                                    videoCapture = capture
                                    boundProvider = provider
                                    boundPreview = preview
                                    boundCapture = capture
                                }.onFailure { onBusy() }
                            },
                            executor,
                        )
                    },
                    modifier = Modifier.fillMaxSize(),
                )
            }
            Text(
                text = formatDuration(seconds * 1000),
                color = Color.White,
                modifier = Modifier.padding(top = 16.dp),
            )
            Row(
                modifier = Modifier.padding(top = 20.dp),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                TextButton(onClick = {
                    active?.stop()
                    if (output.exists()) output.delete()
                    onCancel()
                }) {
                    Text(stringResource(R.string.common_cancel), color = Color.White)
                }
                Button(
                    onClick = {
                        val capture = videoCapture ?: return@Button
                        if (!recording) {
                            val rec = capture.output
                                .prepareRecording(context, FileOutputOptions.Builder(output).build())
                                .withAudioEnabled()
                                .start(ContextCompat.getMainExecutor(context)) { event ->
                                    if (event is VideoRecordEvent.Finalize) {
                                        recording = false
                                        active = null
                                        if (!event.hasError() && output.exists()) {
                                            onRecorded(output, seconds.coerceAtLeast(1) * 1000)
                                        } else {
                                            onBusy()
                                        }
                                    }
                                }
                            active = rec
                            recording = true
                        } else {
                            active?.stop()
                        }
                    },
                ) {
                    Text(
                        if (recording) stringResource(R.string.chat_send)
                        else stringResource(R.string.chat_video_note),
                    )
                }
            }
        }
    }
}
