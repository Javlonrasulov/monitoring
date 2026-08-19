@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)

package com.monitor.device.ui.screens

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.ContentUris
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.widget.Toast
import android.widget.VideoView
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.rounded.AttachFile
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.Image
import androidx.compose.material.icons.rounded.Mic
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.PhotoCamera
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Videocam
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.ImageLoader
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.monitor.device.R
import com.monitor.device.core.api.DeviceApiClient
import com.monitor.device.core.auth.TokenStore
import com.monitor.device.core.chat.ChatRealtime
import com.monitor.device.core.model.ChatMessageDto
import com.monitor.device.core.model.ChatReplyDto
import com.monitor.device.core.model.ChatThreadDto
import com.monitor.device.ui.chat.MessageBubble
import com.monitor.device.ui.chat.TypingDots
import com.monitor.device.ui.chat.VideoNoteCapture
import com.monitor.device.ui.chat.VoiceCapture
import com.monitor.device.ui.chat.compressImage
import com.monitor.device.ui.chat.copyUriToCache
import com.monitor.device.ui.chat.defaultVoiceWaveform
import com.monitor.device.ui.chat.dayKey
import com.monitor.device.ui.chat.displayName
import com.monitor.device.ui.chat.formatDayLabel
import com.monitor.device.ui.chat.formatDuration
import com.monitor.device.ui.chat.formatFileSize
import com.monitor.device.ui.chat.formatLastSeen
import com.monitor.device.ui.chat.mimeFor
import com.monitor.device.ui.chat.videoDurationMs
import com.monitor.device.ui.chat.videoThumbnail
import com.monitor.device.ui.components.UserAvatar
import com.monitor.device.ui.theme.MonitorTheme
import com.monitor.device.ui.theme.Spacing
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import org.json.JSONObject
import java.io.File
import java.util.UUID
import kotlin.math.roundToInt

private data class PendingMedia(
    val file: File,
    val name: String,
    val mime: String,
    val type: String,
    val durationMs: Int? = null,
    val width: Int? = null,
    val height: Int? = null,
    val thumbnail: File? = null,
    val waveformJson: String? = null,
)

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun ChatThreadScreen(
    apiClient: DeviceApiClient,
    tokenStore: TokenStore,
    threadId: String,
    title: String,
    onBack: () -> Unit,
) {
    val colors = MonitorTheme.colors
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val listState = rememberLazyListState()
    var thread by remember { mutableStateOf<ChatThreadDto?>(null) }
    var messages by remember { mutableStateOf<List<ChatMessageDto>>(emptyList()) }
    var nextCursor by remember { mutableStateOf<String?>(null) }
    var draft by remember { mutableStateOf("") }
    var replyTo by remember { mutableStateOf<ChatMessageDto?>(null) }
    var editing by remember { mutableStateOf<ChatMessageDto?>(null) }
    var typing by remember { mutableStateOf(false) }
    var searchOpen by remember { mutableStateOf(false) }
    var searchQuery by remember { mutableStateOf("") }
    var searchHits by remember { mutableStateOf<List<ChatMessageDto>>(emptyList()) }
    var profileOpen by remember { mutableStateOf(false) }
    var attachOpen by remember { mutableStateOf(false) }
    var actionMessage by remember { mutableStateOf<ChatMessageDto?>(null) }
    var pending by remember { mutableStateOf<PendingMedia?>(null) }
    var recording by remember { mutableStateOf(false) }
    var recordMs by remember { mutableStateOf(0) }
    var videoNote by remember { mutableStateOf(false) }
    var playingId by remember { mutableStateOf<String?>(null) }
    var voicePaused by remember { mutableStateOf(false) }
    var playbackProgress by remember { mutableFloatStateOf(0f) }
    var playbackPositionMs by remember { mutableIntStateOf(0) }
    var voiceSpeed by remember { mutableFloatStateOf(1f) }
    var fullscreen by remember { mutableStateOf<ChatMessageDto?>(null) }
    var voiceCapture by remember { mutableStateOf<VoiceCapture?>(null) }
    var voiceFile by remember { mutableStateOf<File?>(null) }
    var mediaKind by remember { mutableStateOf("media") }
    var mediaItems by remember { mutableStateOf<List<ChatMessageDto>>(emptyList()) }

    val imageLoader = remember {
        ImageLoader.Builder(context)
            .okHttpClient {
                OkHttpClient.Builder()
                    .addInterceptor { chain ->
                        chain.proceed(
                            chain.request().newBuilder()
                                .header("Authorization", apiClient.authorizationHeader())
                                .build(),
                        )
                    }
                    .build()
            }
            .build()
    }

    val photoPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(10)) { uris ->
        if (uris.isEmpty()) return@rememberLauncherForActivityResult
        val album = if (uris.size > 1) UUID.randomUUID().toString() else null
        scope.launch {
            uris.forEach { uri ->
                runCatching {
                    val (file, size) = compressImage(context, uri)
                    sendMedia(
                        apiClient, threadId, PendingMedia(file, displayName(context, uri, "photo.jpg"), "image/jpeg", "IMAGE", width = size.first, height = size.second),
                        replyTo?.id, album,
                    ) { sent -> messages = mergeMessage(messages, sent) }
                }
            }
            replyTo = null
        }
    }
    val videoPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        uri ?: return@rememberLauncherForActivityResult
        scope.launch {
            val file = withContext(Dispatchers.IO) { copyUriToCache(context, uri, displayName(context, uri, "video.mp4")) }
            pending = PendingMedia(file, file.name, mimeFor(context, uri, "video/mp4"), "VIDEO", videoDurationMs(file), thumbnail = videoThumbnail(context, file))
        }
    }
    val filePicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        uri ?: return@rememberLauncherForActivityResult
        scope.launch {
            val name = displayName(context, uri, "file.bin")
            val file = withContext(Dispatchers.IO) { copyUriToCache(context, uri, name) }
            pending = PendingMedia(file, name, mimeFor(context, uri, "application/octet-stream"), "FILE")
        }
    }

    val realtime = remember { ChatRealtime(apiClient.apiBaseUrl, tokenStore) }
    DisposableEffect(threadId) {
        realtime.connect { event, payload ->
            when (event) {
                "chat.message", "chat.message.updated" -> {
                    realtime.decodeMessage(payload)?.let { incoming ->
                        if (incoming.threadId == threadId || incoming.threadId == null) {
                            messages = mergeMessage(messages, incoming)
                        }
                    }
                }
                "chat.typing" -> {
                    val obj = runCatching { JSONObject(payload) }.getOrNull()
                    if (obj?.optString("threadId") == threadId && obj.optString("userId") != tokenStore.userId()) {
                        typing = obj.optBoolean("typing", true)
                    }
                }
                "chat.presence" -> {
                    val obj = runCatching { JSONObject(payload) }.getOrNull()
                    val userId = obj?.optString("userId")
                    if (userId != null && userId == thread?.counterpartUserId) {
                        thread = thread?.copy(online = obj.optBoolean("online"), lastSeenAt = obj.optString("lastSeenAt").ifBlank { thread?.lastSeenAt })
                    }
                }
                "chat.read" -> {
                    messages = messages.map {
                        if (it.mine && it.readAt == null) it.copy(readAt = java.time.Instant.now().toString()) else it
                    }
                }
            }
        }
        onDispose { realtime.disconnect() }
    }

    LaunchedEffect(threadId) {
        runCatching { apiClient.readChat(threadId) }
        runCatching { apiClient.chatThread(threadId) }.onSuccess {
            thread = it
            it.viewerUserId?.let(tokenStore::saveUserId)
        }
        runCatching { apiClient.chatMessages(threadId, take = 50) }.onSuccess {
            messages = it.items
            nextCursor = it.nextCursor
        }
    }

    LaunchedEffect(draft, threadId) {
        if (draft.isBlank()) return@LaunchedEffect
        realtime.emitTyping(threadId, true)
        delay(1800)
        realtime.emitTyping(threadId, false)
    }

    LaunchedEffect(recording) {
        while (recording) {
            recordMs = voiceCapture?.elapsedMs() ?: recordMs
            delay(200)
        }
    }

    LaunchedEffect(listState, nextCursor) {
        snapshotFlow { listState.firstVisibleItemIndex }
            .collect { index ->
                if (index == 0 && nextCursor != null) {
                    val page = runCatching { apiClient.chatMessages(threadId, nextCursor) }.getOrNull() ?: return@collect
                    nextCursor = page.nextCursor
                    messages = (page.items + messages).distinctBy { it.id }
                }
            }
    }

    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) listState.animateScrollToItem(messages.lastIndex)
        runCatching { apiClient.readChat(threadId) }
    }

    var player by remember { mutableStateOf<MediaPlayer?>(null) }
    DisposableEffect(Unit) {
        onDispose { player?.release() }
    }

    fun playMessage(message: ChatMessageDto) {
        if (playingId == message.id) {
            val mp = player
            if (mp != null && mp.isPlaying) {
                mp.pause()
                voicePaused = true
            } else {
                mp?.start()
                voicePaused = false
            }
            return
        }
        player?.release()
        val url = apiClient.mediaUrl(threadId, message.id)
        val mp = MediaPlayer().apply {
            setAudioAttributes(AudioAttributes.Builder().setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
            setDataSource(context, Uri.parse(url), mapOf("Authorization" to apiClient.authorizationHeader()))
            setOnCompletionListener {
                playingId = null
                voicePaused = false
                playbackProgress = 0f
                playbackPositionMs = 0
            }
            prepare()
            playbackParams = playbackParams.setSpeed(voiceSpeed)
            start()
        }
        player = mp
        playingId = message.id
        voicePaused = false
        playbackProgress = 0f
        playbackPositionMs = 0
    }

    LaunchedEffect(playingId, voicePaused) {
        while (playingId != null && !voicePaused) {
            val mp = player
            val duration = mp?.duration ?: 0
            val position = mp?.currentPosition ?: 0
            if (duration > 0) {
                playbackProgress = position.toFloat() / duration.toFloat()
                playbackPositionMs = position
            }
            delay(40)
        }
    }

    if (videoNote) {
        VideoNoteCapture(
            onRecorded = { file, duration ->
                videoNote = false
                scope.launch {
                    runCatching {
                        sendMedia(
                            apiClient, threadId,
                            PendingMedia(file, "video-note.mp4", "video/mp4", "VIDEO_NOTE", duration, thumbnail = videoThumbnail(context, file)),
                            replyTo?.id, null,
                        ) { sent -> messages = mergeMessage(messages, sent) }
                    }.onFailure {
                        Toast.makeText(context, context.getString(R.string.chat_camera_busy), Toast.LENGTH_SHORT).show()
                    }
                }
            },
            onCancel = { videoNote = false },
            onBusy = {
                videoNote = false
                Toast.makeText(context, context.getString(R.string.chat_camera_busy), Toast.LENGTH_SHORT).show()
            },
        )
        return
    }

    BackHandler(onBack = onBack)

    val wallpaper = if (colors.isDark) Color(0xFF0B1413) else Color(0xFFE8F1F0)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(wallpaper)
            .imePadding()
            .navigationBarsPadding(),
    ) {
        ChatHeader(
            title = thread?.counterpartName ?: title,
            subtitle = formatLastSeen(context, thread?.lastSeenAt, thread?.online == true, typing),
            typing = typing,
            avatarUrl = thread?.takeIf { it.counterpartHasAvatar }?.let {
                apiClient.avatarUrl(it.counterpartUserId, it.counterpartAvatarUpdatedAt)
            },
            imageLoader = imageLoader,
            online = thread?.online == true,
            onBack = onBack,
            onSearch = { searchOpen = !searchOpen },
            onProfile = { profileOpen = true },
        )
        if (searchOpen) {
            OutlinedTextField(
                value = searchQuery,
                onValueChange = {
                    searchQuery = it
                    scope.launch {
                        if (it.isBlank()) searchHits = emptyList()
                        else runCatching { apiClient.searchChat(threadId, it) }.onSuccess { page -> searchHits = page.items }
                    }
                },
                modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.md),
                placeholder = { Text(stringResource(R.string.chat_search_messages)) },
                singleLine = true,
                leadingIcon = { Icon(Icons.Rounded.Search, contentDescription = null) },
            )
            searchHits.forEach { hit ->
                TextButton(onClick = {
                    val idx = messages.indexOfFirst { it.id == hit.id }
                    if (idx >= 0) scope.launch { listState.animateScrollToItem(idx) }
                    searchOpen = false
                }) {
                    Text("${formatClockSafe(hit.createdAt)}  ${hit.text ?: hit.fileName ?: hit.messageType}")
                }
            }
        }
        LazyColumn(
            state = listState,
            modifier = Modifier.weight(1f).fillMaxWidth(),
            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            itemsIndexed(messages, key = { _, item -> item.id }) { index, message ->
                val prev = messages.getOrNull(index - 1)
                if (dayKey(message.createdAt) != dayKey(prev?.createdAt)) {
                    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                        Text(
                            formatDayLabel(context, message.createdAt),
                            modifier = Modifier
                                .clip(RoundedCornerShape(12.dp))
                                .background(Color.Black.copy(alpha = 0.28f))
                                .padding(horizontal = 10.dp, vertical = 4.dp),
                            color = Color.White,
                            fontSize = 12.sp,
                        )
                    }
                    Spacer(Modifier.height(6.dp))
                }
                var offsetX by remember(message.id) { mutableFloatStateOf(0f) }
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .offset { IntOffset(offsetX.roundToInt(), 0) }
                        .pointerInput(message.id) {
                            detectHorizontalDragGestures(
                                onDragEnd = {
                                    if (offsetX > 72f) replyTo = message
                                    offsetX = 0f
                                },
                                onHorizontalDrag = { _, drag ->
                                    offsetX = (offsetX + drag).coerceIn(0f, 120f)
                                },
                            )
                        }
                        .combinedClickable(
                            onClick = {},
                            onLongClick = { actionMessage = message },
                        ),
                    contentAlignment = if (message.mine) Alignment.CenterEnd else Alignment.CenterStart,
                ) {
                    MessageBubble(
                        message = message,
                        apiClient = apiClient,
                        imageLoader = imageLoader,
                        threadId = threadId,
                        playingId = playingId,
                        voicePaused = voicePaused,
                        playbackProgress = playbackProgress,
                        playbackPositionMs = playbackPositionMs,
                        voiceSpeed = voiceSpeed,
                        onPlayToggle = { playMessage(it) },
                        onVoiceSpeed = {
                            voiceSpeed = when (voiceSpeed) {
                                1f -> 1.5f
                                1.5f -> 2f
                                else -> 1f
                            }
                            val mp = player
                            if (mp != null) {
                                runCatching { mp.playbackParams = mp.playbackParams.setSpeed(voiceSpeed) }
                            }
                        },
                        onVoiceSeek = { ratio ->
                            val mp = player
                            val duration = mp?.duration ?: 0
                            if (mp != null && duration > 0 && playingId != null) {
                                val target = (duration * ratio).toInt()
                                mp.seekTo(target)
                                playbackProgress = ratio
                                playbackPositionMs = target
                            }
                        },
                        onOpenMedia = { fullscreen = it },
                        onReplyClick = { id ->
                            val idx = messages.indexOfFirst { it.id == id }
                            if (idx >= 0) scope.launch { listState.animateScrollToItem(idx) }
                        },
                    )
                }
            }
            if (typing) {
                item("typing") {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Start) {
                        Box(
                            Modifier
                                .clip(RoundedCornerShape(16.dp))
                                .background(colors.surfaceMuted)
                                .padding(horizontal = 12.dp, vertical = 8.dp),
                        ) { TypingDots(colors.textMuted) }
                    }
                }
            }
        }
        replyTo?.let { target ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(colors.surfaceMuted)
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(stringResource(R.string.chat_reply), fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
                    Text(target.text ?: target.fileName ?: target.messageType.orEmpty(), maxLines = 1, color = colors.textMuted)
                }
                IconButton(onClick = { replyTo = null }) {
                    Icon(Icons.Rounded.Close, contentDescription = stringResource(R.string.common_close))
                }
            }
        }
        if (recording) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(if (colors.isDark) Color(0xFF17201F) else Color(0xFFF7F8F8))
                    .padding(horizontal = 8.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .clip(CircleShape)
                        .background(colors.danger),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Rounded.Mic, contentDescription = null, tint = Color.White)
                }
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text(stringResource(R.string.chat_recording), color = colors.danger, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                    Text(formatDuration(recordMs), color = colors.textPrimary, fontSize = 16.sp, fontWeight = FontWeight.Medium)
                }
                TextButton(onClick = {
                    voiceCapture?.cancel()
                    voiceCapture = null
                    recording = false
                }) { Text(stringResource(R.string.common_cancel)) }
                IconButton(
                    onClick = {
                        val capture = voiceCapture
                        val file = voiceFile
                        val duration = capture?.stop() ?: 0
                        recording = false
                        voiceCapture = null
                        voiceFile = null
                        if (file != null && file.exists()) {
                            scope.launch {
                                sendMedia(
                                    apiClient, threadId,
                                    PendingMedia(
                                        file, "voice.m4a", "audio/mp4", "VOICE", duration,
                                        waveformJson = defaultVoiceWaveform(file.absolutePath)
                                            .joinToString(prefix = "[", postfix = "]") { "%.3f".format(it) },
                                    ),
                                    replyTo?.id, null,
                                ) { sent -> messages = mergeMessage(messages, sent) }
                                replyTo = null
                            }
                        }
                    },
                    modifier = Modifier
                        .size(48.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.primary),
                ) {
                    Icon(Icons.AutoMirrored.Rounded.Send, contentDescription = stringResource(R.string.chat_send), tint = Color.White)
                }
            }
        } else {
            ComposerBar(
                draft = draft,
                onDraft = { draft = it },
                onAttach = { attachOpen = true },
                onSend = {
                    val text = draft.trim()
                    if (text.isEmpty()) return@ComposerBar
                    val clientId = UUID.randomUUID().toString()
                    val optimistic = ChatMessageDto(
                        id = clientId,
                        threadId = threadId,
                        text = text,
                        messageType = "TEXT",
                        mine = true,
                        clientId = clientId,
                        replyTo = replyTo?.let { ChatReplyDto(it.id, it.text, it.messageType, it.senderUserId, it.fileName) },
                        localStatus = "sending",
                    )
                    if (editing != null) {
                        val id = editing!!.id
                        draft = ""
                        editing = null
                        scope.launch {
                            runCatching { apiClient.editChat(threadId, id, text) }
                                .onSuccess { messages = mergeMessage(messages, it) }
                        }
                    } else {
                        draft = ""
                        messages = messages + optimistic
                        val replyId = replyTo?.id
                        replyTo = null
                        scope.launch {
                            runCatching { apiClient.sendChat(threadId, text, replyId, clientId) }
                                .onSuccess { messages = mergeMessage(messages, it) }
                                .onFailure {
                                    messages = messages.map { msg -> if (msg.id == clientId) msg.copy(localStatus = "failed") else msg }
                                }
                        }
                    }
                },
                onMicDown = {
                    val file = File(context.cacheDir, "voice-${UUID.randomUUID()}.m4a")
                    val capture = VoiceCapture(file)
                    runCatching { capture.start() }
                        .onSuccess {
                            voiceCapture = capture
                            voiceFile = file
                            recording = true
                            recordMs = 0
                        }
                },
                onCamera = { videoNote = true },
            )
        }
    }

    if (attachOpen) {
        val colors = MonitorTheme.colors
        ModalBottomSheet(
            onDismissRequest = { attachOpen = false },
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
            containerColor = if (colors.isDark) Color(0xFF1C2625) else Color.White,
        ) {
            AttachPickerSheet(
                imageLoader = imageLoader,
                onGallery = {
                    attachOpen = false
                    photoPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                },
                onVideo = {
                    attachOpen = false
                    videoPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.VideoOnly))
                },
                onFile = {
                    attachOpen = false
                    filePicker.launch("*/*")
                },
                onVideoNote = {
                    attachOpen = false
                    videoNote = true
                },
                onRecentPhoto = { uri ->
                    attachOpen = false
                    scope.launch {
                        runCatching {
                            val (file, size) = compressImage(context, uri)
                            sendMedia(
                                apiClient, threadId,
                                PendingMedia(file, displayName(context, uri, "photo.jpg"), "image/jpeg", "IMAGE", width = size.first, height = size.second),
                                replyTo?.id, null,
                            ) { sent -> messages = mergeMessage(messages, sent) }
                            replyTo = null
                        }
                    }
                },
            )
        }
    }

    actionMessage?.let { target ->
        ModalBottomSheet(onDismissRequest = { actionMessage = null }) {
            Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                listOf("👍", "❤️", "😂", "🔥", "😮").forEach { emoji ->
                    Text(emoji, fontSize = 26.sp, modifier = Modifier.clickableEmoji {
                        scope.launch { runCatching { apiClient.reactChat(threadId, target.id, emoji) }.onSuccess { messages = mergeMessage(messages, it) } }
                        actionMessage = null
                    })
                }
            }
            ActionRow(stringResource(R.string.chat_reply)) { replyTo = target; actionMessage = null }
            ActionRow(stringResource(R.string.chat_copy)) {
                val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                clipboard.setPrimaryClip(ClipData.newPlainText("message", target.text ?: target.fileName.orEmpty()))
                actionMessage = null
            }
            ActionRow(stringResource(R.string.chat_forward)) {
                scope.launch {
                    runCatching { apiClient.sendChat(threadId, target.text.orEmpty(), forwardedFromId = target.id) }
                        .onSuccess { messages = mergeMessage(messages, it) }
                }
                actionMessage = null
            }
            if (target.mine && target.messageType == "TEXT") {
                ActionRow(stringResource(R.string.chat_edit)) {
                    editing = target
                    draft = target.text.orEmpty()
                    actionMessage = null
                }
            }
            ActionRow(stringResource(R.string.chat_delete_me)) {
                scope.launch {
                    runCatching { apiClient.deleteChat(threadId, target.id, false) }
                    messages = messages.filterNot { it.id == target.id }
                }
                actionMessage = null
            }
            if (target.mine) {
                ActionRow(stringResource(R.string.chat_delete_everyone)) {
                    scope.launch {
                        runCatching { apiClient.deleteChat(threadId, target.id, true) }
                            .onSuccess { messages = messages.map { if (it.id == target.id) it.copy(deletedForEveryone = true, text = null) else it } }
                    }
                    actionMessage = null
                }
            }
            ActionRow(stringResource(R.string.chat_share)) {
                val send = Intent(Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    putExtra(Intent.EXTRA_TEXT, target.text ?: target.fileName.orEmpty())
                }
                context.startActivity(Intent.createChooser(send, context.getString(R.string.chat_share)))
                actionMessage = null
            }
            Spacer(Modifier.height(20.dp))
        }
    }

    pending?.let { item ->
        ModalBottomSheet(onDismissRequest = { pending = null }) {
            Text(stringResource(R.string.chat_preview_send), modifier = Modifier.padding(16.dp), style = MaterialTheme.typography.titleMedium)
            Text("${item.name}\n${formatFileSize(item.file.length())}", modifier = Modifier.padding(horizontal = 16.dp), color = colors.textMuted)
            Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                TextButton(onClick = { pending = null }) { Text(stringResource(R.string.common_cancel)) }
                TextButton(onClick = {
                    val media = item
                    pending = null
                    scope.launch {
                        runCatching {
                            sendMedia(apiClient, threadId, media, replyTo?.id, null) { sent ->
                                messages = mergeMessage(messages, sent)
                            }
                        }.onFailure {
                            Toast.makeText(context, context.getString(R.string.chat_upload_failed), Toast.LENGTH_SHORT).show()
                        }
                        replyTo = null
                    }
                }) { Text(stringResource(R.string.chat_send)) }
            }
        }
    }

    if (profileOpen) {
        ModalBottomSheet(onDismissRequest = { profileOpen = false }) {
            Column(
                modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                UserAvatar(
                    name = thread?.counterpartName ?: title,
                    imageUrl = thread?.takeIf { it.counterpartHasAvatar }?.let {
                        apiClient.avatarUrl(it.counterpartUserId, it.counterpartAvatarUpdatedAt)
                    },
                    imageLoader = imageLoader,
                    size = 96.dp,
                    online = thread?.online == true,
                )
            }
            Text(thread?.counterpartName ?: title, modifier = Modifier.padding(16.dp), style = MaterialTheme.typography.titleLarge)
            Text(formatLastSeen(context, thread?.lastSeenAt, thread?.online == true, false), modifier = Modifier.padding(horizontal = 16.dp), color = colors.textMuted)
            listOf("media" to R.string.chat_media, "files" to R.string.chat_files, "links" to R.string.chat_links, "voice" to R.string.chat_voice_tab).forEach { (kind, label) ->
                TextButton(onClick = {
                    mediaKind = kind
                    scope.launch {
                        runCatching { apiClient.chatMedia(threadId, kind) }.onSuccess { mediaItems = it.items }
                    }
                }) { Text(stringResource(label)) }
            }
            mediaItems.take(40).forEach { item ->
                TextButton(onClick = {
                    val idx = messages.indexOfFirst { it.id == item.id }
                    if (idx >= 0) scope.launch { listState.animateScrollToItem(idx) }
                    profileOpen = false
                }) {
                    Text(item.fileName ?: item.text ?: item.messageType.orEmpty(), maxLines = 1)
                }
            }
            Spacer(Modifier.height(24.dp))
        }
    }

    fullscreen?.let { media ->
        Dialog(onDismissRequest = { fullscreen = null }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
            Box(Modifier.fillMaxSize().background(Color.Black)) {
                when (media.messageType) {
                    "IMAGE" -> AsyncImage(
                        model = ImageRequest.Builder(context)
                            .data(apiClient.mediaUrl(threadId, media.id))
                            .addHeader("Authorization", apiClient.authorizationHeader())
                            .build(),
                        imageLoader = imageLoader,
                        contentDescription = null,
                        contentScale = ContentScale.Fit,
                        modifier = Modifier.fillMaxSize(),
                    )
                    "VIDEO", "VIDEO_NOTE" -> AndroidView(
                        factory = { ctx ->
                            VideoView(ctx).apply {
                                setVideoURI(Uri.parse(apiClient.mediaUrl(threadId, media.id)), mapOf("Authorization" to apiClient.authorizationHeader()))
                                setOnPreparedListener { start() }
                            }
                        },
                        modifier = Modifier.fillMaxSize(),
                    )
                    else -> {
                        val intent = Intent(Intent.ACTION_VIEW).apply {
                            data = Uri.parse(apiClient.mediaUrl(threadId, media.id, download = true))
                        }
                        runCatching { context.startActivity(intent) }
                        fullscreen = null
                    }
                }
                IconButton(onClick = { fullscreen = null }, modifier = Modifier.align(Alignment.TopEnd).padding(12.dp)) {
                    Icon(Icons.Rounded.Close, contentDescription = null, tint = Color.White)
                }
            }
        }
    }
}

@Composable
private fun ChatHeader(
    title: String,
    subtitle: String,
    typing: Boolean,
    avatarUrl: String?,
    imageLoader: ImageLoader,
    online: Boolean,
    onBack: () -> Unit,
    onSearch: () -> Unit,
    onProfile: () -> Unit,
) {
    val colors = MonitorTheme.colors
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(if (colors.isDark) Color(0xF21B2423) else Color(0xF2FFFFFF))
            .padding(horizontal = 4.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onBack) {
            Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = stringResource(R.string.common_close))
        }
        Box(
            modifier = Modifier.combinedClickable(onClick = onProfile, onLongClick = onProfile),
        ) {
            UserAvatar(
                name = title,
                imageUrl = avatarUrl,
                imageLoader = imageLoader,
                size = 40.dp,
                online = online,
            )
        }
        Column(modifier = Modifier.weight(1f).padding(horizontal = 10.dp).combinedClickable(onClick = onProfile, onLongClick = onProfile)) {
            Text(title, style = MaterialTheme.typography.titleMedium, color = colors.textPrimary, maxLines = 1)
            if (typing) TypingDots(MaterialTheme.colorScheme.primary) else {
                Text(subtitle, style = MaterialTheme.typography.bodySmall, color = colors.textMuted, maxLines = 1)
            }
        }
        IconButton(onClick = onSearch) { Icon(Icons.Rounded.Search, contentDescription = stringResource(R.string.chats_search)) }
        IconButton(onClick = onProfile) { Icon(Icons.Rounded.MoreVert, contentDescription = stringResource(R.string.chat_settings)) }
    }
}

@Composable
private fun ComposerBar(
    draft: String,
    onDraft: (String) -> Unit,
    onAttach: () -> Unit,
    onSend: () -> Unit,
    onMicDown: () -> Unit,
    onCamera: () -> Unit,
) {
    val colors = MonitorTheme.colors
    val empty = draft.isBlank()
    val bar = if (colors.isDark) Color(0xFF17201F) else Color(0xFFF7F8F8)
    val field = if (colors.isDark) Color(0xFF24302E) else Color.White
    val iconTint = colors.textMuted

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(bar)
            .padding(start = 8.dp, end = 6.dp, top = 6.dp, bottom = 6.dp),
        verticalAlignment = Alignment.Bottom,
    ) {
        Row(
            modifier = Modifier
                .weight(1f)
                .heightIn(min = 48.dp)
                .clip(RoundedCornerShape(24.dp))
                .background(field),
            verticalAlignment = Alignment.Bottom,
        ) {
            BasicTextField(
                value = draft,
                onValueChange = onDraft,
                modifier = Modifier
                    .weight(1f)
                    .padding(start = 16.dp, top = 12.dp, bottom = 12.dp, end = 4.dp),
                textStyle = TextStyle(color = colors.textPrimary, fontSize = 16.sp),
                cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
                maxLines = 5,
                decorationBox = { inner ->
                    Box {
                        if (empty) {
                            Text(
                                stringResource(R.string.chat_placeholder),
                                color = colors.textMuted,
                                fontSize = 16.sp,
                            )
                        }
                        inner()
                    }
                },
            )
            if (empty) {
                IconButton(onClick = onCamera, modifier = Modifier.size(40.dp)) {
                    Icon(
                        Icons.Rounded.PhotoCamera,
                        contentDescription = stringResource(R.string.chat_video_note),
                        tint = iconTint,
                    )
                }
            }
            IconButton(onClick = onAttach, modifier = Modifier.size(40.dp)) {
                Icon(
                    Icons.Rounded.AttachFile,
                    contentDescription = stringResource(R.string.chat_attach),
                    tint = iconTint,
                )
            }
        }
        Spacer(Modifier.width(6.dp))
        IconButton(
            onClick = if (empty) onMicDown else onSend,
            modifier = Modifier
                .size(48.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.primary),
        ) {
            Icon(
                if (empty) Icons.Rounded.Mic else Icons.AutoMirrored.Rounded.Send,
                contentDescription = stringResource(if (empty) R.string.chat_voice else R.string.chat_send),
                tint = Color.White,
            )
        }
    }
}

@Composable
private fun AttachPickerSheet(
    imageLoader: ImageLoader,
    onGallery: () -> Unit,
    onVideo: () -> Unit,
    onFile: () -> Unit,
    onVideoNote: () -> Unit,
    onRecentPhoto: (Uri) -> Unit,
) {
    val context = LocalContext.current
    val colors = MonitorTheme.colors
    var recents by remember { mutableStateOf<List<Uri>>(emptyList()) }
    LaunchedEffect(Unit) {
        recents = withContext(Dispatchers.IO) { recentGalleryUris(context) }
    }

    LazyRow(
        modifier = Modifier.fillMaxWidth(),
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item("gallery") {
            Box(
                modifier = Modifier
                    .size(88.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(Color(0xFF4C9CE2))
                    .clickable(onClick = onGallery),
                contentAlignment = Alignment.Center,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Icons.Rounded.Image, contentDescription = null, tint = Color.White, modifier = Modifier.size(30.dp))
                    Spacer(Modifier.height(6.dp))
                    Text(stringResource(R.string.chat_gallery), color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                }
            }
        }
        items(recents, key = { it.toString() }) { uri ->
            AsyncImage(
                model = ImageRequest.Builder(context).data(uri).crossfade(true).size(256).build(),
                imageLoader = imageLoader,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .size(88.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .clickable { onRecentPhoto(uri) },
            )
        }
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 8.dp, end = 8.dp, top = 22.dp, bottom = 28.dp),
        horizontalArrangement = Arrangement.SpaceEvenly,
    ) {
        AttachAction(Icons.Rounded.Image, stringResource(R.string.chat_photo), Color(0xFF5BA8F5), onGallery)
        AttachAction(Icons.Rounded.Videocam, stringResource(R.string.chat_video), Color(0xFFE45C7A), onVideo)
        AttachAction(Icons.Rounded.Description, stringResource(R.string.chat_file), Color(0xFF9B6FE8), onFile)
        AttachAction(Icons.Rounded.PhotoCamera, stringResource(R.string.chat_video_note), Color(0xFF2A9D8F), onVideoNote)
    }
}

@Composable
private fun AttachAction(
    icon: ImageVector,
    label: String,
    circle: Color,
    onClick: () -> Unit,
) {
    val colors = MonitorTheme.colors
    Column(
        modifier = Modifier
            .clickable(onClick = onClick)
            .padding(horizontal = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier
                .size(56.dp)
                .clip(CircleShape)
                .background(circle),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(26.dp))
        }
        Spacer(Modifier.height(8.dp))
        Text(label, color = colors.textPrimary, fontSize = 12.sp, maxLines = 1)
    }
}

private fun recentGalleryUris(context: Context, limit: Int = 28): List<Uri> {
    val permission = if (Build.VERSION.SDK_INT >= 33) {
        Manifest.permission.READ_MEDIA_IMAGES
    } else {
        Manifest.permission.READ_EXTERNAL_STORAGE
    }
    if (ContextCompat.checkSelfPermission(context, permission) != PackageManager.PERMISSION_GRANTED) {
        return emptyList()
    }
    val collection = MediaStore.Images.Media.EXTERNAL_CONTENT_URI
    val result = ArrayList<Uri>(limit)
    context.contentResolver.query(
        collection,
        arrayOf(MediaStore.Images.Media._ID),
        null,
        null,
        "${MediaStore.Images.Media.DATE_ADDED} DESC",
    )?.use { cursor ->
        val idIdx = cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID)
        while (cursor.moveToNext() && result.size < limit) {
            result += ContentUris.withAppendedId(collection, cursor.getLong(idIdx))
        }
    }
    return result
}

@Composable
private fun ActionRow(label: String, onClick: () -> Unit) {
    TextButton(onClick = onClick, modifier = Modifier.fillMaxWidth()) { Text(label) }
}

private fun Modifier.clickableEmoji(onClick: () -> Unit) = this.then(
    Modifier.combinedClickable(onClick = onClick, onLongClick = onClick),
)

private fun mergeMessage(current: List<ChatMessageDto>, incoming: ChatMessageDto): List<ChatMessageDto> {
    val without = current.filterNot { it.id == incoming.id || (!incoming.clientId.isNullOrBlank() && it.clientId == incoming.clientId) }
    return (without + incoming.copy(mine = incoming.mine || current.any { it.clientId == incoming.clientId && it.mine }))
        .sortedBy { it.createdAt }
}

private suspend fun sendMedia(
    apiClient: DeviceApiClient,
    threadId: String,
    media: PendingMedia,
    replyToId: String?,
    albumId: String?,
    onSent: (ChatMessageDto) -> Unit,
) {
    val sent = apiClient.uploadChatFile(
        threadId = threadId,
        file = media.file,
        fileName = media.name,
        mimeType = media.mime,
        messageType = media.type,
        durationMs = media.durationMs,
        width = media.width,
        height = media.height,
        replyToId = replyToId,
        clientId = UUID.randomUUID().toString(),
        albumId = albumId,
        waveformJson = media.waveformJson,
        thumbnail = media.thumbnail,
    )
    onSent(sent)
}

private fun formatClockSafe(iso: String?): String = iso?.substring(11, 16) ?: ""
