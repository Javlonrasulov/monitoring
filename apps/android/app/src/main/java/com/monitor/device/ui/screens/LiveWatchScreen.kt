package com.monitor.device.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.viewinterop.AndroidView
import com.monitor.device.R
import com.monitor.device.core.api.DeviceApiClient
import com.monitor.device.monitoring.stream.WhepViewer
import com.monitor.device.ui.components.IconPillButton
import com.monitor.device.ui.theme.MonitorTheme
import com.monitor.device.ui.theme.Spacing
import kotlinx.coroutines.launch
import org.webrtc.SurfaceViewRenderer

@Composable
fun LiveWatchScreen(
    apiClient: DeviceApiClient,
    deviceId: String,
    title: String,
    onBack: () -> Unit,
) {
    val colors = MonitorTheme.colors
    val context = LocalContext.current
    val viewer = remember { WhepViewer(context.applicationContext) }
    val scope = rememberCoroutineScope()
    var renderer by remember { mutableStateOf<SurfaceViewRenderer?>(null) }
    var status by remember { mutableStateOf("") }
    val waiting = stringResource(R.string.settings_watch_waiting)
    val failed = stringResource(R.string.settings_watch_failed)
    val upgrade = stringResource(R.string.settings_watch_upgrade)

    LaunchedEffect(deviceId, renderer) {
        val view = renderer ?: return@LaunchedEffect
        status = waiting
        runCatching {
            val token = apiClient.deviceViewerToken(deviceId)
            if (token.videoEnabled == false) {
                status = upgrade
                return@runCatching
            }
            viewer.start(token.whepUrl, token.token, token.audioEnabled, view)
            status = ""
        }.onFailure {
            status = if (
                it.message?.contains("Trial", ignoreCase = true) == true ||
                it.message?.contains("Upgrade", ignoreCase = true) == true ||
                it.message?.contains("Pro", ignoreCase = true) == true
            ) {
                upgrade
            } else {
                failed
            }
        }
    }

    DisposableEffect(viewer) {
        onDispose {
            scope.launch { runCatching { viewer.stop() } }
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
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                color = colors.textPrimary,
                modifier = Modifier.align(Alignment.Center),
            )
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
        }
    }
}
