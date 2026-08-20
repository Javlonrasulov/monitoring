package com.monitor.device.ui.screens

import android.content.Intent
import android.net.Uri
import android.view.ViewGroup
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Download
import androidx.compose.material.icons.rounded.VolumeOff
import androidx.compose.material.icons.rounded.VolumeUp
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
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import com.monitor.device.R
import com.monitor.device.core.api.DeviceApiClient
import com.monitor.device.core.model.RecordingSegmentDto
import com.monitor.device.ui.components.ErrorBanner
import com.monitor.device.ui.components.IconPillButton
import com.monitor.device.ui.theme.BrandPalette
import com.monitor.device.ui.theme.MonitorTheme
import com.monitor.device.ui.theme.Spacing
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

private enum class HistoryPreset { TODAY, YESTERDAY, LAST3 }

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
    val zone = remember { ZoneId.systemDefault() }
    var allItems by remember { mutableStateOf<List<RecordingSegmentDto>>(emptyList()) }
    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(true) }
    var preset by remember { mutableStateOf(HistoryPreset.TODAY) }
    var activeId by remember { mutableStateOf<String?>(null) }
    var playingUrl by remember { mutableStateOf<String?>(null) }
    var muted by remember { mutableStateOf(false) }
    val fail = stringResource(R.string.history_load_failed)
    val playerBg = Color(0xFF0B1417)
    val trackBg = Color(0xFF0F191D)
    val tickColor = Color(0xFF152025)

    val filtered = remember(allItems, preset, zone) {
        filterHistory(allItems, preset, zone)
    }
    val timelineDay = remember(preset, zone) {
        when (preset) {
            HistoryPreset.YESTERDAY -> LocalDate.now(zone).minusDays(1)
            else -> LocalDate.now(zone)
        }
    }

    suspend fun loadOnce() {
        runCatching { apiClient.linkedRecordings(deviceId) }
            .onSuccess {
                allItems = it.items.filter { row ->
                    row.status.equals("READY", true) ||
                        row.status.equals("RECORDING", true) ||
                        row.status.equals("PROCESSING", true)
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

    val player = remember { ExoPlayer.Builder(context).build() }
    DisposableEffect(player) {
        onDispose { player.release() }
    }
    LaunchedEffect(playingUrl) {
        val url = playingUrl
        if (url.isNullOrBlank()) {
            player.stop()
            player.clearMediaItems()
            return@LaunchedEffect
        }
        player.setMediaItem(MediaItem.fromUri(url))
        player.prepare()
        player.playWhenReady = true
        player.volume = if (muted) 0f else 1f
    }
    LaunchedEffect(muted) {
        player.volume = if (muted) 0f else 1f
    }

    fun openPlayback(row: RecordingSegmentDto) {
        if (!row.status.equals("READY", true)) return
        scope.launch {
            runCatching { apiClient.linkedRecordingPlayback(row.id) }
                .onSuccess {
                    activeId = row.id
                    playingUrl = apiClient.absoluteApiUrl(it.url)
                }
                .onFailure { error = DeviceApiClient.errorMessage(it, fail) }
        }
    }

    fun download(row: RecordingSegmentDto) {
        if (!row.status.equals("READY", true)) return
        scope.launch {
            runCatching { apiClient.linkedRecordingPlayback(row.id) }
                .onSuccess {
                    val url = apiClient.absoluteApiUrl(it.url)
                    val sep = if (url.contains("?")) "&" else "?"
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("$url${sep}download=1"))
                    runCatching { context.startActivity(intent) }
                }
                .onFailure { error = DeviceApiClient.errorMessage(it, fail) }
        }
    }

    BackHandler { onBack() }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .navigationBarsPadding(),
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
                    text = stringResource(R.string.history_title),
                    style = MaterialTheme.typography.titleMedium,
                    color = colors.textPrimary,
                )
                Text(
                    text = title.ifBlank { stringResource(R.string.history_subtitle) },
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.textMuted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(horizontal = Spacing.lg, vertical = Spacing.sm),
            verticalArrangement = Arrangement.spacedBy(Spacing.sm),
        ) {
            item {
                Text(
                    text = stringResource(R.string.history_retention),
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.textMuted,
                )
            }
            if (error != null) {
                item {
                    ErrorBanner(
                        title = stringResource(R.string.pair_error_title),
                        message = error.orEmpty(),
                    )
                }
            }
            item {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(Spacing.xs),
                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                ) {
                    HistoryChip(
                        label = stringResource(R.string.history_today),
                        selected = preset == HistoryPreset.TODAY,
                        onClick = { preset = HistoryPreset.TODAY },
                    )
                    HistoryChip(
                        label = stringResource(R.string.history_yesterday),
                        selected = preset == HistoryPreset.YESTERDAY,
                        onClick = { preset = HistoryPreset.YESTERDAY },
                    )
                    HistoryChip(
                        label = stringResource(R.string.history_last3),
                        selected = preset == HistoryPreset.LAST3,
                        onClick = { preset = HistoryPreset.LAST3 },
                    )
                }
            }

            item {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(14.dp))
                        .background(playerBg)
                        .border(1.dp, colors.border, RoundedCornerShape(14.dp)),
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .aspectRatio(16f / 9f)
                            .background(Color.Black),
                        contentAlignment = Alignment.Center,
                    ) {
                        if (playingUrl != null) {
                            AndroidView(
                                modifier = Modifier.fillMaxSize(),
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
                                update = { it.player = player },
                            )
                        } else {
                            Text(
                                text = stringResource(R.string.history_no_player),
                                color = Color(0xFF94A3B8),
                                style = MaterialTheme.typography.bodyMedium,
                            )
                        }
                    }
                    if (playingUrl != null) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(Color(0xFF111C20))
                                .padding(horizontal = Spacing.sm, vertical = Spacing.xs),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text(
                                text = filtered.firstOrNull { it.id == activeId }
                                    ?.let { formatRange(it, zone) }
                                    .orEmpty(),
                                color = Color(0xFFCBD5E1),
                                style = MaterialTheme.typography.labelMedium,
                                modifier = Modifier.weight(1f),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            IconPillButton(
                                icon = if (muted) Icons.Rounded.VolumeOff else Icons.Rounded.VolumeUp,
                                contentDescription = stringResource(
                                    if (muted) R.string.history_unmute else R.string.history_mute,
                                ),
                                onClick = { muted = !muted },
                            )
                        }
                    }
                }
            }

            item {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(14.dp))
                        .background(playerBg)
                        .border(1.dp, colors.border, RoundedCornerShape(14.dp))
                        .padding(Spacing.md),
                ) {
                    HistoryTimeline(
                        day = timelineDay,
                        items = if (preset == HistoryPreset.LAST3) {
                            filtered.filter {
                                parseInstant(it.startedAt)?.atZone(zone)?.toLocalDate() == timelineDay
                            }
                        } else {
                            filtered
                        },
                        zone = zone,
                        trackBg = trackBg,
                        tickColor = tickColor,
                        onSelect = { openPlayback(it) },
                    )
                    Spacer(modifier = Modifier.size(Spacing.sm))
                    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.md)) {
                        LegendDot(BrandPalette.Teal600, stringResource(R.string.history_status_ready))
                        LegendDot(BrandPalette.Teal400, stringResource(R.string.history_status_recording), outline = true)
                        LegendDot(Color(0xFF64748B), stringResource(R.string.history_status_gap))
                    }
                }
            }

            when {
                loading && filtered.isEmpty() -> {
                    item {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(120.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            CircularProgressIndicator()
                        }
                    }
                }
                filtered.isEmpty() -> {
                    item {
                        Text(
                            text = stringResource(R.string.history_empty),
                            color = colors.textMuted,
                            modifier = Modifier.padding(vertical = Spacing.lg),
                        )
                    }
                }
                else -> {
                    items(filtered, key = { it.id }) { row ->
                        ArchiveRow(
                            row = row,
                            deviceTitle = title,
                            active = row.id == activeId,
                            zone = zone,
                            onPlay = { openPlayback(row) },
                            onDownload = { download(row) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun HistoryChip(label: String, selected: Boolean, onClick: () -> Unit) {
    val colors = MonitorTheme.colors
    Text(
        text = label,
        style = MaterialTheme.typography.labelLarge,
        color = if (selected) MaterialTheme.colorScheme.onPrimary else colors.textSecondary,
        modifier = Modifier
            .clip(RoundedCornerShape(14.dp))
            .background(if (selected) MaterialTheme.colorScheme.primary else colors.surfaceMuted)
            .clickable(onClick = onClick)
            .padding(horizontal = Spacing.md, vertical = Spacing.sm),
    )
}

@Composable
private fun LegendDot(color: Color, label: String, outline: Boolean = false) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .size(10.dp)
                .then(
                    if (outline) {
                        Modifier.border(1.5.dp, color, RoundedCornerShape(2.dp))
                    } else {
                        Modifier.background(color, RoundedCornerShape(2.dp))
                    },
                ),
        )
        Spacer(modifier = Modifier.width(6.dp))
        Text(label, style = MaterialTheme.typography.labelSmall, color = Color(0xFF94A3B8))
    }
}

@Composable
private fun HistoryTimeline(
    day: LocalDate,
    items: List<RecordingSegmentDto>,
    zone: ZoneId,
    trackBg: Color,
    tickColor: Color,
    onSelect: (RecordingSegmentDto) -> Unit,
) {
    val start = day.atStartOfDay(zone)
    val end = day.plusDays(1).atStartOfDay(zone)
    val spanMs = (end.toInstant().toEpochMilli() - start.toInstant().toEpochMilli()).coerceAtLeast(1)
    val startMs = start.toInstant().toEpochMilli()

    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            listOf(0, 6, 12, 18, 23).forEach { h ->
                Text(
                    text = "%02d:00".format(h),
                    style = MaterialTheme.typography.labelSmall,
                    color = Color(0xFF94A3B8),
                )
            }
        }
        Spacer(modifier = Modifier.size(4.dp))
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(42.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(trackBg)
                .pointerInput(items, startMs, spanMs) {
                    detectTapGestures { offset ->
                        val ratio = (offset.x / size.width).coerceIn(0f, 1f)
                        val t = startMs + (ratio * spanMs).toLong()
                        val hit = items
                            .filter { it.status.equals("READY", true) }
                            .firstOrNull { row ->
                                val from = parseInstant(row.startedAt)?.toEpochMilli() ?: return@firstOrNull false
                                val to = parseInstant(row.endedAt)?.toEpochMilli()
                                    ?: from + (row.durationSec ?: 30) * 1000L
                                t in from..to
                            }
                        if (hit != null) onSelect(hit)
                    }
                },
        ) {
            Canvas(modifier = Modifier.fillMaxSize()) {
                val hourW = size.width / 24f
                for (i in 0 until 24) {
                    drawLine(
                        color = tickColor,
                        start = Offset(i * hourW, 0f),
                        end = Offset(i * hourW, size.height),
                        strokeWidth = 1.dp.toPx(),
                    )
                }
                items.forEach { row ->
                    val from = parseInstant(row.startedAt) ?: return@forEach
                    val to = parseInstant(row.endedAt)
                        ?: from.plusSeconds((row.durationSec ?: 30).toLong())
                    val left = ((from.toEpochMilli() - startMs).toFloat() / spanMs).coerceIn(0f, 1f)
                    val right = ((to.toEpochMilli() - startMs).toFloat() / spanMs).coerceIn(0f, 1f)
                    val w = ((right - left) * size.width).coerceAtLeast(3.dp.toPx())
                    val recording = row.status.equals("RECORDING", true)
                    drawRoundRect(
                        color = if (recording) {
                            BrandPalette.Teal400.copy(alpha = 0.55f)
                        } else {
                            BrandPalette.Teal600
                        },
                        topLeft = Offset(left * size.width, 8.dp.toPx()),
                        size = Size(w, size.height - 16.dp.toPx()),
                        cornerRadius = CornerRadius(4.dp.toPx()),
                    )
                }
            }
        }
    }
}

@Composable
private fun ArchiveRow(
    row: RecordingSegmentDto,
    deviceTitle: String,
    active: Boolean,
    zone: ZoneId,
    onPlay: () -> Unit,
    onDownload: () -> Unit,
) {
    val colors = MonitorTheme.colors
    val ready = row.status.equals("READY", true)
    val statusColor = when {
        row.status.equals("READY", true) -> BrandPalette.SuccessDark
        row.status.equals("RECORDING", true) -> BrandPalette.Teal400
        else -> colors.textMuted
    }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(if (active) colors.surfaceElevated else colors.surfaceMuted)
            .border(
                1.dp,
                if (active) MaterialTheme.colorScheme.primary else colors.border,
                RoundedCornerShape(12.dp),
            )
            .clickable(enabled = ready, onClick = onPlay)
            .padding(Spacing.md),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = deviceTitle.ifBlank { "—" },
                style = MaterialTheme.typography.titleSmall,
                color = colors.textPrimary,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.weight(1f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = statusLabel(row.status),
                style = MaterialTheme.typography.labelMedium,
                color = statusColor,
                fontWeight = FontWeight.Bold,
            )
        }
        Spacer(modifier = Modifier.size(4.dp))
        Text(
            text = listOfNotNull(
                cameraLabel(row.cameraFacing),
                formatRange(row, zone),
            ).joinToString(" · "),
            style = MaterialTheme.typography.bodySmall,
            color = colors.textMuted,
        )
        Spacer(modifier = Modifier.size(4.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = listOf(
                    formatDuration(row.durationSec),
                    formatBytes(row.fileSize),
                ).joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = colors.textSecondary,
            )
            if (ready) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.clickable(onClick = onDownload),
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Download,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(16.dp),
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = stringResource(R.string.history_download),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
            }
        }
    }
}

@Composable
private fun statusLabel(status: String?): String {
    return when (status?.uppercase(Locale.US)) {
        "RECORDING" -> stringResource(R.string.history_status_recording)
        "READY" -> stringResource(R.string.history_status_ready)
        else -> status.orEmpty()
    }
}

@Composable
private fun cameraLabel(facing: String?): String {
    return when (facing?.uppercase(Locale.US)) {
        "FRONT" -> stringResource(R.string.settings_camera_front)
        "BACK" -> stringResource(R.string.settings_camera_back)
        else -> facing.orEmpty()
    }
}

private fun filterHistory(
    items: List<RecordingSegmentDto>,
    preset: HistoryPreset,
    zone: ZoneId,
): List<RecordingSegmentDto> {
    val now = ZonedDateTime.now(zone)
    val (from, to) = when (preset) {
        HistoryPreset.TODAY -> now.toLocalDate().atStartOfDay(zone) to now.toLocalDate().plusDays(1).atStartOfDay(zone)
        HistoryPreset.YESTERDAY -> {
            val y = now.toLocalDate().minusDays(1)
            y.atStartOfDay(zone) to y.plusDays(1).atStartOfDay(zone)
        }
        HistoryPreset.LAST3 -> now.minusDays(3) to now.plusMinutes(1)
    }
    val fromMs = from.toInstant().toEpochMilli()
    val toMs = to.toInstant().toEpochMilli()
    return items.filter { row ->
        val t = parseInstant(row.startedAt)?.toEpochMilli() ?: return@filter false
        t in fromMs until toMs
    }
}

private fun parseInstant(iso: String?): Instant? {
    if (iso.isNullOrBlank()) return null
    return runCatching { Instant.parse(iso) }.getOrNull()
}

private fun formatRange(row: RecordingSegmentDto, zone: ZoneId): String {
    val start = parseInstant(row.startedAt)?.atZone(zone) ?: return "—"
    val end = parseInstant(row.endedAt)?.atZone(zone)
    val day = DateTimeFormatter.ofPattern("dd.MM.yyyy")
    val clock = DateTimeFormatter.ofPattern("HH:mm:ss")
    return if (end != null) {
        "${day.format(start)} ${clock.format(start)} - ${clock.format(end)}"
    } else {
        "${day.format(start)} ${clock.format(start)}"
    }
}

private fun formatDuration(sec: Int?): String {
    if (sec == null) return "—"
    val h = sec / 3600
    val m = (sec % 3600) / 60
    val s = sec % 60
    return if (h > 0) "%d:%02d:%02d".format(h, m, s) else "%d:%02d".format(m, s)
}

private fun formatBytes(bytes: Int?): String {
    val b = bytes ?: 0
    return when {
        b < 1024 -> "$b B"
        b < 1024 * 1024 -> "${b / 1024} KB"
        else -> String.format(Locale.US, "%.1f MB", b / (1024.0 * 1024.0))
    }
}
