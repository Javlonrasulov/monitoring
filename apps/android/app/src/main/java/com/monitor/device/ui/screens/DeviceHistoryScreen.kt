package com.monitor.device.ui.screens

import android.view.ViewGroup
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
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
import androidx.media3.common.MediaItem
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import com.monitor.device.R
import com.monitor.device.core.api.DeviceApiClient
import com.monitor.device.core.model.RecordingSegmentDto
import com.monitor.device.ui.components.ErrorBanner
import com.monitor.device.ui.components.IconPillButton
import com.monitor.device.ui.components.MonitorCard
import com.monitor.device.ui.theme.MonitorTheme
import com.monitor.device.ui.theme.Spacing
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Composable
fun DeviceHistoryScreen(
    apiClient: DeviceApiClient,
    deviceId: String,
    title: String,
    onBack: () -> Unit,
) {
    val colors = MonitorTheme.colors
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var items by remember { mutableStateOf<List<RecordingSegmentDto>>(emptyList()) }
    var error by remember { mutableStateOf<String?>(null) }
    var playingUrl by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(true) }
    var playError by remember { mutableStateOf<String?>(null) }
    val fail = stringResource(R.string.history_load_failed)
    val empty = stringResource(R.string.history_empty)
    val formatter = remember {
        DateTimeFormatter.ofPattern("dd.MM HH:mm").withZone(ZoneId.systemDefault())
    }

    suspend fun loadOnce() {
        runCatching { apiClient.linkedRecordings(deviceId) }
            .onSuccess {
                items = it.items.filter { row ->
                    row.status.equals("READY", ignoreCase = true) ||
                        row.status.equals("RECORDING", ignoreCase = true)
                }
                error = null
            }
            .onFailure { error = DeviceApiClient.errorMessage(it, fail) }
        loading = false
    }

    LaunchedEffect(deviceId) {
        loading = true
        runCatching { apiClient.startLinkedRecording(deviceId) }
        loadOnce()
        while (isActive) {
            delay(5_000)
            loadOnce()
        }
    }

    val player = remember {
        ExoPlayer.Builder(context).build()
    }
    DisposableEffect(player) {
        onDispose {
            player.release()
        }
    }
    LaunchedEffect(playingUrl) {
        playError = null
        val url = playingUrl
        if (url.isNullOrBlank()) {
            player.stop()
            player.clearMediaItems()
            return@LaunchedEffect
        }
        player.setMediaItem(MediaItem.fromUri(url))
        player.prepare()
        player.playWhenReady = true
    }

    BackHandler { if (playingUrl != null) playingUrl = null else onBack() }

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
                onClick = { if (playingUrl != null) playingUrl = null else onBack() },
            )
            Column(
                modifier = Modifier.align(Alignment.Center),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    text = stringResource(R.string.history_title),
                    style = MaterialTheme.typography.titleMedium,
                    color = colors.textPrimary,
                )
                if (title.isNotBlank()) {
                    Text(title, style = MaterialTheme.typography.bodySmall, color = colors.textMuted)
                }
            }
        }

        val playUrl = playingUrl
        if (playUrl != null) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .padding(Spacing.md),
            ) {
                AndroidView(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f)
                        .clip(RoundedCornerShape(16.dp))
                        .background(colors.surfaceMuted),
                    factory = { ctx ->
                        PlayerView(ctx).apply {
                            layoutParams = ViewGroup.LayoutParams(
                                ViewGroup.LayoutParams.MATCH_PARENT,
                                ViewGroup.LayoutParams.MATCH_PARENT,
                            )
                            useController = true
                            this.player = player
                        }
                    },
                    update = { view -> view.player = player },
                )
                if (playError != null) {
                    Spacer(modifier = Modifier.size(Spacing.sm))
                    Text(playError.orEmpty(), color = MaterialTheme.colorScheme.error)
                }
            }
        } else {
            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .padding(horizontal = Spacing.lg)
                    .navigationBarsPadding(),
            ) {
                if (error != null) {
                    ErrorBanner(
                        title = stringResource(R.string.pair_error_title),
                        message = error.orEmpty(),
                    )
                    Spacer(modifier = Modifier.size(Spacing.sm))
                }
                Text(
                    text = stringResource(R.string.history_hint),
                    style = MaterialTheme.typography.bodyMedium,
                    color = colors.textMuted,
                )
                Spacer(modifier = Modifier.size(Spacing.md))
                if (loading && items.isEmpty()) {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator()
                    }
                } else if (!loading && items.isEmpty() && error == null) {
                    Text(empty, color = colors.textMuted)
                } else {
                    LazyColumn(
                        verticalArrangement = Arrangement.spacedBy(Spacing.sm),
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f),
                    ) {
                        items(items, key = { it.id }) { row ->
                            val ready = row.status.equals("READY", ignoreCase = true)
                            MonitorCard {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable(enabled = ready) {
                                            scope.launch {
                                                runCatching {
                                                    apiClient.linkedRecordingPlayback(row.id)
                                                }
                                                    .onSuccess {
                                                        playingUrl = apiClient.absoluteApiUrl(it.url)
                                                    }
                                                    .onFailure {
                                                        error = DeviceApiClient.errorMessage(it, fail)
                                                    }
                                            }
                                        },
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = formatHistoryTime(row.startedAt, formatter),
                                            style = MaterialTheme.typography.titleSmall,
                                            color = colors.textPrimary,
                                        )
                                        Text(
                                            text = listOfNotNull(
                                                row.cameraFacing,
                                                row.status,
                                                row.durationSec?.let { "${it}s" },
                                            ).joinToString(" · "),
                                            style = MaterialTheme.typography.bodySmall,
                                            color = colors.textMuted,
                                        )
                                    }
                                    Icon(
                                        imageVector = Icons.Rounded.PlayArrow,
                                        contentDescription = null,
                                        tint = if (ready) {
                                            MaterialTheme.colorScheme.primary
                                        } else {
                                            colors.textMuted
                                        },
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

private fun formatHistoryTime(iso: String?, formatter: DateTimeFormatter): String {
    if (iso.isNullOrBlank()) return "—"
    return runCatching { formatter.format(Instant.parse(iso)) }.getOrElse { iso.take(16) }
}
