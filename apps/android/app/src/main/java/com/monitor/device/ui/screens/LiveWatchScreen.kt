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
) {
    val colors = MonitorTheme.colors
    val context = LocalContext.current
    val viewer = remember { WhepViewer(context.applicationContext) }
    val scope = rememberCoroutineScope()
    var renderer by remember { mutableStateOf<SurfaceViewRenderer?>(null) }
    var status by remember { mutableStateOf("") }
    var facing by remember {
        mutableStateOf(CameraFacing.from(initialFacing) ?: CameraFacing.BACK)
    }
    var cameraBusy by remember { mutableStateOf(false) }
    val waiting = stringResource(R.string.settings_watch_waiting)
    val failed = stringResource(R.string.settings_watch_failed)
    val upgrade = stringResource(R.string.settings_watch_upgrade)
    val frontLabel = stringResource(R.string.settings_camera_front)
    val backLabel = stringResource(R.string.settings_camera_back)

    LaunchedEffect(deviceId, renderer) {
        val view = renderer ?: return@LaunchedEffect
        status = waiting
        var lastError: Throwable? = null
        repeat(4) { attempt ->
            runCatching {
                val token = apiClient.deviceViewerToken(deviceId)
                if (token.videoEnabled == false) {
                    status = upgrade
                    return@LaunchedEffect
                }
                val whepUrl = publicStreamUrl(token.whepUrl, apiClient.apiBaseUrl)
                viewer.start(whepUrl, token.token, token.audioEnabled, view)
                status = ""
                return@LaunchedEffect
            }.onFailure { lastError = it }
            delay(1_500L * (attempt + 1))
        }
        status = DeviceApiClient.errorMessage(lastError ?: Exception(), failed)
    }

    DisposableEffect(viewer) {
        onDispose {
            scope.launch { runCatching { viewer.stop() } }
        }
    }

    BackHandler { onBack() }

    fun setFacing(next: CameraFacing) {
        if (cameraBusy || next == facing) return
        cameraBusy = true
        scope.launch {
            runCatching { apiClient.setLinkedCamera(deviceId, next.name) }
                .onSuccess { facing = CameraFacing.from(it.cameraFacing) ?: next }
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
