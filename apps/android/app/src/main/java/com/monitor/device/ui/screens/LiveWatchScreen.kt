package com.monitor.device.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.VolumeOff
import androidx.compose.material.icons.rounded.VolumeUp
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.unit.dp
import com.monitor.device.R
import com.monitor.device.core.api.DeviceApiClient
import com.monitor.device.core.model.CameraFacing
import com.monitor.device.monitoring.stream.WhepViewer
import com.monitor.device.ui.components.IconPillButton
import com.monitor.device.ui.theme.MonitorTheme
import com.monitor.device.ui.theme.Spacing
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.webrtc.SurfaceViewRenderer
import java.net.URI

@Composable
fun LiveWatchScreen(
    apiClient: DeviceApiClient,
    deviceId: String,
    title: String,
    initialFacing: String? = null,
    onBack: () -> Unit,
    onOpenHistory: () -> Unit = {},
) {
    val colors = MonitorTheme.colors
    val context = LocalContext.current
    val viewer = remember { WhepViewer(context.applicationContext) }
    val scope = rememberCoroutineScope()
    var renderer by remember { mutableStateOf<SurfaceViewRenderer?>(null) }
    var status by remember { mutableStateOf("") }
    var facing by remember {
        mutableStateOf(CameraFacing.from(initialFacing) ?: CameraFacing.FRONT)
    }
    var cameraBusy by remember { mutableStateOf(false) }
    var watchGeneration by remember { mutableStateOf(0) }
    var audioAllowed by remember { mutableStateOf(false) }
    var audioMuted by remember { mutableStateOf(false) }
    var canHistory by remember { mutableStateOf(false) }
    val waiting = stringResource(R.string.settings_watch_waiting)
    val failed = stringResource(R.string.settings_watch_failed)
    val notPublishing = stringResource(R.string.settings_watch_not_publishing)
    val upgrade = stringResource(R.string.settings_watch_upgrade)
    val frontLabel = stringResource(R.string.settings_camera_front)
    val backLabel = stringResource(R.string.settings_camera_back)

    LaunchedEffect(deviceId, renderer, watchGeneration) {
        val view = renderer ?: return@LaunchedEffect
        status = waiting
        runCatching { viewer.stop() }
        var lastError: Throwable? = null
        repeat(6) { attempt ->
            runCatching {
                val token = apiClient.deviceViewerToken(deviceId)
                if (token.videoEnabled == false) {
                    status = upgrade
                    return@LaunchedEffect
                }
                audioAllowed = token.audioEnabled
                canHistory = token.canRecordings
                audioMuted = !token.audioEnabled
                if (token.canRecordings) {
                    runCatching { apiClient.startLinkedRecording(deviceId) }
                }
                val whepUrl = publicStreamUrl(token.whepUrl, apiClient.apiBaseUrl)
                viewer.start(whepUrl, token.token, token.audioEnabled, view)
                if (token.audioEnabled) {
                    viewer.setAudioMuted(false)
                    audioMuted = false
                }
                status = ""
                return@LaunchedEffect
            }.onFailure { lastError = it }
            delay(1_500L * (attempt + 1))
        }
        status = liveWatchErrorMessage(lastError, failed, notPublishing)
    }

    DisposableEffect(viewer) {
        onDispose {
            scope.launch { runCatching { viewer.stop() } }
        }
    }

    BackHandler { onBack() }

    fun setFacing(next: CameraFacing) {
        if (cameraBusy) return
        cameraBusy = true
        scope.launch {
            runCatching { apiClient.setLinkedCamera(deviceId, next.name) }
                .onSuccess {
                    facing = CameraFacing.from(it.cameraFacing) ?: next
                    delay(2_500)
                    watchGeneration += 1
                }
                .onFailure { status = DeviceApiClient.errorMessage(it, failed) }
            cameraBusy = false
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = Spacing.lg, vertical = Spacing.sm),
        ) {
            IconPillButton(
                icon = Icons.Rounded.ArrowBack,
                contentDescription = stringResource(R.string.common_close),
                onClick = onBack,
            )
            Column(
                modifier = Modifier.align(Alignment.Center),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    text = if (facing == CameraFacing.FRONT) frontLabel else backLabel,
                    style = MaterialTheme.typography.titleMedium,
                    color = colors.textPrimary,
                )
                if (title.isNotBlank()) {
                    Text(
                        text = title,
                        style = MaterialTheme.typography.bodySmall,
                        color = colors.textMuted,
                    )
                }
            }
            Row(
                modifier = Modifier.align(Alignment.CenterEnd),
                horizontalArrangement = Arrangement.spacedBy(Spacing.xs),
            ) {
                if (audioAllowed) {
                    IconPillButton(
                        icon = if (audioMuted) Icons.Rounded.VolumeOff else Icons.Rounded.VolumeUp,
                        contentDescription = stringResource(
                            if (audioMuted) R.string.live_sound_on else R.string.live_sound_off,
                        ),
                        onClick = {
                            val next = !audioMuted
                            audioMuted = next
                            viewer.setAudioMuted(next)
                        },
                    )
                }
                if (canHistory) {
                    IconPillButton(
                        icon = Icons.Rounded.History,
                        contentDescription = stringResource(R.string.history_title),
                        onClick = onOpenHistory,
                    )
                }
            }
        }
        Box(modifier = Modifier.fillMaxSize()) {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { ctx ->
                    SurfaceViewRenderer(ctx).also { renderer = it }
                },
            )
            if (status.isNotBlank()) {
                Text(
                    text = status,
                    color = colors.textPrimary,
                    modifier = Modifier
                        .align(Alignment.Center)
                        .padding(Spacing.lg),
                )
            }
            Row(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .navigationBarsPadding()
                    .padding(Spacing.lg)
                    .clip(RoundedCornerShape(18.dp))
                    .background(colors.surfaceElevated.copy(alpha = 0.92f))
                    .border(1.dp, colors.border, RoundedCornerShape(18.dp))
                    .padding(4.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                CameraChip(
                    label = frontLabel,
                    selected = facing == CameraFacing.FRONT,
                    enabled = !cameraBusy,
                    onClick = { setFacing(CameraFacing.FRONT) },
                )
                CameraChip(
                    label = backLabel,
                    selected = facing == CameraFacing.BACK,
                    enabled = !cameraBusy,
                    onClick = { setFacing(CameraFacing.BACK) },
                )
            }
        }
    }
}

@Composable
private fun CameraChip(
    label: String,
    selected: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    val colors = MonitorTheme.colors
    Text(
        text = label,
        style = MaterialTheme.typography.labelLarge,
        color = if (selected) MaterialTheme.colorScheme.onPrimary else colors.textSecondary,
        modifier = Modifier
            .clip(RoundedCornerShape(14.dp))
            .background(if (selected) MaterialTheme.colorScheme.primary else colors.surfaceMuted)
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = Spacing.lg, vertical = Spacing.sm),
    )
}

private fun liveWatchErrorMessage(
    error: Throwable?,
    failed: String,
    notPublishing: String,
): String {
    val raw = error?.message.orEmpty()
    if (raw.contains("no one is publishing", ignoreCase = true)) {
        return notPublishing
    }
    if (raw.contains("WHEP", ignoreCase = true)) {
        return failed
    }
    return DeviceApiClient.errorMessage(error ?: Exception(), failed)
}

private fun publicStreamUrl(streamUrl: String, apiBaseUrl: String): String {
    return runCatching {
        val stream = URI(streamUrl)
        val host = stream.host.orEmpty()
        if (host.isNotBlank() && host != "localhost" && host != "127.0.0.1") {
            return streamUrl
        }
        val api = URI(apiBaseUrl)
        URI(
            api.scheme,
            api.authority,
            stream.path,
            stream.query,
            stream.fragment,
        ).toString()
    }.getOrDefault(streamUrl)
}
