package com.monitor.device.ui.chat

import android.net.Uri
import android.widget.VideoView
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.Done
import androidx.compose.material.icons.rounded.DoneAll
import androidx.compose.material.icons.rounded.Download
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material.icons.rounded.Videocam
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import coil.ImageLoader
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.monitor.device.R
import com.monitor.device.core.api.DeviceApiClient
import com.monitor.device.core.model.ChatMessageDto
import com.monitor.device.ui.theme.MonitorTheme
import java.io.File

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun MessageBubble(
    message: ChatMessageDto,
    apiClient: DeviceApiClient,
    imageLoader: ImageLoader,
    threadId: String,
    playingId: String?,
    voicePaused: Boolean = false,
    playbackProgress: Float = 0f,
    playbackPositionMs: Int = 0,
    voiceSpeed: Float = 1f,
    onPlayToggle: (ChatMessageDto) -> Unit,
    onVoiceSpeed: () -> Unit = {},
    onVoiceSeek: (Float) -> Unit = {},
    onOpenMedia: (ChatMessageDto) -> Unit,
    onReplyClick: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = MonitorTheme.colors
    val mine = message.mine
    val bubble = if (mine) {
        if (colors.isDark) Color(0xFF1A6B64) else Color(0xFF0F766E)
    } else {
        if (colors.isDark) Color(0xFF1C2B29) else Color(0xFFFFFFFF)
    }
    val onBubble = if (mine) Color.White else colors.textPrimary
    val muted = if (mine) Color.White.copy(alpha = 0.78f) else colors.textMuted
    val shape = RoundedCornerShape(
        topStart = 18.dp,
        topEnd = 18.dp,
        bottomStart = if (mine) 18.dp else 5.dp,
        bottomEnd = if (mine) 5.dp else 18.dp,
    )
    val deleted = message.deletedForEveryone
    val type = message.messageType.orEmpty()

    Column(
        modifier = modifier.widthIn(max = 300.dp),
        horizontalAlignment = if (mine) Alignment.End else Alignment.Start,
    ) {
        Box(
            modifier = Modifier
                .clip(shape)
                .background(bubble)
                .padding(horizontal = 10.dp, vertical = 8.dp),
        ) {
            Column {
                if (message.forwarded) {
                    Text(stringResource(R.string.chat_forwarded), color = muted, fontSize = 11.sp, fontWeight = FontWeight.Medium)
                }
                message.replyTo?.let { reply ->
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(8.dp))
                            .background(Color.Black.copy(alpha = 0.16f))
                            .clickable { reply.id?.let(onReplyClick) }
                            .padding(horizontal = 8.dp, vertical = 6.dp),
                    ) {
                        Column {
                            Text(
                                reply.fileName ?: reply.text?.take(80) ?: reply.messageType.orEmpty(),
                                color = onBubble,
                                fontSize = 12.sp,
                                maxLines = 2,
                            )
                        }
                    }
                    Spacer(Modifier.height(6.dp))
                }
                when {
                    deleted -> Text(stringResource(R.string.chat_message_deleted), color = muted, fontSize = 14.sp)
                    type == "IMAGE" -> MediaImage(message, apiClient, imageLoader, threadId, onOpenMedia)
                    type == "VIDEO" -> VideoThumb(message, apiClient, imageLoader, threadId, onOpenMedia, muted, onBubble)
                    type == "VIDEO_NOTE" -> VideoNoteBubble(message, apiClient, threadId, playingId, onPlayToggle)
                    type == "VOICE" -> VoiceBubble(
                        message = message,
                        playing = playingId == message.id && !voicePaused,
                        active = playingId == message.id,
                        progress = if (playingId == message.id) playbackProgress else 0f,
                        positionMs = if (playingId == message.id) playbackPositionMs else message.durationMs ?: 0,
                        speed = voiceSpeed,
                        mine = mine,
                        bubble = bubble,
                        muted = muted,
                        onBubble = onBubble,
                        onPlayToggle = onPlayToggle,
                        onSpeed = onVoiceSpeed,
                        onSeek = onVoiceSeek,
                    )
                    type == "FILE" -> FileBubble(message, muted, onBubble) { onOpenMedia(message) }
                    else -> Text(message.text.orEmpty(), color = onBubble, fontSize = 16.sp)
                }
                if (!deleted && !message.text.isNullOrBlank() && type != "TEXT") {
                    Spacer(Modifier.height(4.dp))
                    Text(message.text.orEmpty(), color = onBubble, fontSize = 14.sp)
                }
                Row(
                    modifier = Modifier.align(Alignment.End).padding(top = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (message.editedAt != null) {
                        Text(stringResource(R.string.chat_edited), color = muted, fontSize = 10.sp)
                        Spacer(Modifier.width(6.dp))
                    }
                    Text(formatClock(message.createdAt), color = muted, fontSize = 11.sp)
                    if (mine) {
                        Spacer(Modifier.width(2.dp))
                        ReadReceipt(message, muted)
                    }
                }
            }
        }
        if (message.localStatus == "failed") {
            Row(
                modifier = Modifier.padding(top = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Rounded.ErrorOutline, contentDescription = null, tint = colors.danger, modifier = Modifier.size(14.dp))
                Spacer(Modifier.width(4.dp))
                Text(
                    if (message.messageType == "TEXT") {
                        stringResource(R.string.chat_send_failed)
                    } else {
                        stringResource(R.string.chat_upload_failed)
                    },
                    color = colors.danger,
                    fontSize = 11.sp,
                )
            }
        }
        message.uploadProgress?.let { progress ->
            if (progress < 1f) {
                LinearProgressIndicator(
                    progress = { progress },
                    modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                )
            }
        }
        if (message.reactions.isNotEmpty()) {
            FlowRow(
                modifier = Modifier.padding(top = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                message.reactions.forEach { reaction ->
                    Text(
                        text = "${reaction.emoji} ${reaction.count}",
                        modifier = Modifier
                            .clip(RoundedCornerShape(12.dp))
                            .background(
                                if (reaction.mine) MaterialTheme.colorScheme.primary.copy(alpha = 0.2f)
                                else colors.surfaceMuted,
                            )
                            .padding(horizontal = 8.dp, vertical = 2.dp),
                        fontSize = 12.sp,
                        color = colors.textPrimary,
                    )
                }
            }
        }
    }
}

@Composable
private fun MediaImage(
    message: ChatMessageDto,
    apiClient: DeviceApiClient,
    imageLoader: ImageLoader,
    threadId: String,
    onOpenMedia: (ChatMessageDto) -> Unit,
) {
    val url = apiClient.mediaUrl(threadId, message.id, thumb = message.hasThumbnail)
    AsyncImage(
        model = ImageRequest.Builder(LocalContext.current)
            .data(url)
            .addHeader("Authorization", apiClient.authorizationHeader())
            .crossfade(true)
            .build(),
        imageLoader = imageLoader,
        contentDescription = message.fileName,
        contentScale = ContentScale.Crop,
        modifier = Modifier
            .fillMaxWidth()
            .height(180.dp)
            .clip(RoundedCornerShape(12.dp))
            .clickable { onOpenMedia(message) },
    )
}

@Composable
private fun VideoThumb(
    message: ChatMessageDto,
    apiClient: DeviceApiClient,
    imageLoader: ImageLoader,
    threadId: String,
    onOpenMedia: (ChatMessageDto) -> Unit,
    muted: Color,
    onBubble: Color,
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(180.dp)
            .clip(RoundedCornerShape(12.dp))
            .clickable { onOpenMedia(message) },
        contentAlignment = Alignment.Center,
    ) {
        if (message.hasThumbnail) {
            AsyncImage(
                model = ImageRequest.Builder(LocalContext.current)
                    .data(apiClient.mediaUrl(threadId, message.id, thumb = true))
                    .addHeader("Authorization", apiClient.authorizationHeader())
                    .build(),
                imageLoader = imageLoader,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        } else {
            Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.25f)))
        }
        Box(
            modifier = Modifier
                .size(48.dp)
                .clip(CircleShape)
                .background(Color.Black.copy(alpha = 0.45f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Rounded.PlayArrow, contentDescription = null, tint = Color.White)
        }
        Text(
            formatDuration(message.durationMs),
            color = Color.White,
            fontSize = 11.sp,
            modifier = Modifier.align(Alignment.BottomEnd).padding(8.dp),
        )
    }
}

@Composable
private fun VideoNoteBubble(
    message: ChatMessageDto,
    apiClient: DeviceApiClient,
    threadId: String,
    playingId: String?,
    onPlayToggle: (ChatMessageDto) -> Unit,
) {
    val playing = playingId == message.id
    Box(
        modifier = Modifier
            .size(168.dp)
            .clip(CircleShape)
            .background(Color.Black)
            .clickable { onPlayToggle(message) },
        contentAlignment = Alignment.Center,
    ) {
        if (playing) {
            val url = apiClient.mediaUrl(threadId, message.id)
            val auth = apiClient.authorizationHeader()
            AndroidView(
                factory = { context ->
                    VideoView(context).apply {
                        setVideoURI(Uri.parse(url), mapOf("Authorization" to auth))
                        setOnPreparedListener { it.isLooping = true; start() }
                    }
                },
                modifier = Modifier.fillMaxSize(),
            )
        } else {
            Icon(Icons.Rounded.Videocam, contentDescription = null, tint = Color.White, modifier = Modifier.size(36.dp))
        }
        Text(
            formatDuration(message.durationMs),
            color = Color.White,
            fontSize = 11.sp,
            modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 12.dp),
        )
    }
}

@Composable
private fun VoiceBubble(
    message: ChatMessageDto,
    playing: Boolean,
    active: Boolean,
    progress: Float,
    positionMs: Int,
    speed: Float,
    mine: Boolean,
    bubble: Color,
    muted: Color,
    onBubble: Color,
    onPlayToggle: (ChatMessageDto) -> Unit,
    onSpeed: () -> Unit,
    onSeek: (Float) -> Unit,
) {
    val bars = remember(message.id, message.waveform) {
        val raw = message.waveform?.map { it.toFloat() }
        if (raw.isNullOrEmpty()) defaultVoiceWaveform(message.id) else raw
    }
    val playBg = if (mine) Color.White else onBubble
    val playFg = if (mine) bubble else Color.White
    val played = onBubble.copy(alpha = if (mine) 1f else 0.92f)
    val upcoming = onBubble.copy(alpha = if (mine) 0.32f else 0.28f)
    val clamped = progress.coerceIn(0f, 1f)

    Row(
        modifier = Modifier.widthIn(min = 196.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(44.dp)
                .clip(CircleShape)
                .background(playBg)
                .clickable { onPlayToggle(message) },
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = if (playing) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
                contentDescription = null,
                tint = playFg,
                modifier = Modifier.size(26.dp),
            )
        }
        Spacer(Modifier.width(10.dp))
        Column(modifier = Modifier.weight(1f)) {
            Canvas(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(26.dp)
                    .pointerInput(message.id) {
                        detectTapGestures { offset ->
                            val ratio = (offset.x / size.width).coerceIn(0f, 1f)
                            onSeek(ratio)
                        }
                    },
            ) {
                val count = bars.size.coerceAtLeast(1)
                val slot = size.width / count
                val barWidth = (slot * 0.42f).coerceIn(1.6f, 3.2f)
                bars.forEachIndexed { i, amp ->
                    val h = (amp.coerceIn(0.12f, 1f) * size.height)
                    val filled = active && i <= (clamped * count)
                    drawRoundRect(
                        color = if (filled) played else upcoming,
                        topLeft = Offset(i * slot + (slot - barWidth) / 2f, (size.height - h) / 2f),
                        size = Size(barWidth, h),
                        cornerRadius = CornerRadius(barWidth / 2f, barWidth / 2f),
                    )
                }
            }
            Spacer(Modifier.height(4.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = formatVoiceClock(if (active) positionMs else message.durationMs),
                    color = muted,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                )
                Spacer(Modifier.weight(1f))
                if (active) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(10.dp))
                            .background(onBubble.copy(alpha = 0.16f))
                            .clickable(onClick = onSpeed)
                            .padding(horizontal = 7.dp, vertical = 2.dp),
                    ) {
                        Text(
                            text = if (speed == 1f) "1×" else if (speed == 1.5f) "1.5×" else "2×",
                            color = onBubble,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun FileBubble(
    message: ChatMessageDto,
    muted: Color,
    onBubble: Color,
    onOpen: () -> Unit,
) {
    Row(
        modifier = Modifier.clickable(onClick = onOpen),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(onBubble.copy(alpha = 0.16f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Rounded.Description, contentDescription = null, tint = onBubble)
        }
        Spacer(Modifier.width(8.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(message.fileName ?: "File", color = onBubble, fontWeight = FontWeight.Medium, maxLines = 2)
            Text(formatFileSize(message.fileSize), color = muted, fontSize = 12.sp)
        }
        Icon(Icons.Rounded.Download, contentDescription = null, tint = muted)
    }
}

@Composable
private fun ReadReceipt(message: ChatMessageDto, muted: Color) {
    val read = message.readAt != null
    Icon(
        imageVector = when {
            message.localStatus == "sending" -> Icons.Rounded.Schedule
            read -> Icons.Rounded.DoneAll
            else -> Icons.Rounded.Done
        },
        contentDescription = null,
        tint = if (read) Color(0xFF6EC9FF) else muted,
        modifier = Modifier.size(16.dp),
    )
}

@Composable
fun TypingDots(color: Color) {
    val t = rememberInfiniteTransition(label = "typing")
    val a by t.animateFloat(0.3f, 1f, infiniteRepeatable(tween(420, easing = LinearEasing), RepeatMode.Reverse), label = "a")
    Text(stringResource(R.string.chat_typing), color = color.copy(alpha = a), fontSize = 13.sp)
}
