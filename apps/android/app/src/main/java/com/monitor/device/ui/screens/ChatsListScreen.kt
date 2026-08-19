package com.monitor.device.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ChatBubbleOutline
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.monitor.device.R
import com.monitor.device.core.api.DeviceApiClient
import com.monitor.device.core.auth.TokenStore
import com.monitor.device.core.model.ChatThreadDto
import com.monitor.device.ui.chat.formatClock
import com.monitor.device.ui.components.EmptyState
import com.monitor.device.ui.theme.MonitorTheme
import com.monitor.device.ui.theme.Spacing
import kotlinx.coroutines.delay

@Composable
fun ChatsListScreen(
    apiClient: DeviceApiClient,
    tokenStore: TokenStore,
    onOpenThread: (String, String) -> Unit,
    onUnreadChange: (Int) -> Unit = {},
) {
    val colors = MonitorTheme.colors
    var query by remember { mutableStateOf("") }
    var threads by remember { mutableStateOf<List<ChatThreadDto>>(emptyList()) }

    LaunchedEffect(Unit) {
        while (true) {
            runCatching { apiClient.chats() }.onSuccess { list ->
                threads = list
                list.firstOrNull()?.viewerUserId?.let(tokenStore::saveUserId)
                onUnreadChange(list.sumOf { it.unreadCount })
            }
            delay(4000)
        }
    }

    val filtered = threads.filter {
        val name = it.counterpartName ?: it.owner?.name.orEmpty() + it.peer?.name.orEmpty()
        query.isBlank() || name.contains(query, ignoreCase = true) ||
            it.lastMessagePreview.orEmpty().contains(query, ignoreCase = true)
    }

    Column(modifier = Modifier.fillMaxSize().padding(horizontal = Spacing.md)) {
        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            modifier = Modifier.fillMaxWidth().padding(vertical = Spacing.sm),
            singleLine = true,
            shape = RoundedCornerShape(18.dp),
            leadingIcon = { Icon(Icons.Rounded.Search, contentDescription = null) },
            placeholder = { Text(stringResource(R.string.chats_search)) },
        )

        if (filtered.isEmpty()) {
            EmptyState(
                icon = Icons.Rounded.ChatBubbleOutline,
                title = stringResource(R.string.chats_empty_title),
                message = stringResource(R.string.chats_empty_message),
            )
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                items(filtered, key = { it.id }) { thread ->
                    val title = thread.counterpartName
                        ?: thread.owner?.name
                        ?: thread.peer?.name
                        ?: stringResource(R.string.chats_untitled)
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(16.dp))
                            .clickable { onOpenThread(thread.id, title) }
                            .padding(horizontal = 8.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Box(contentAlignment = Alignment.BottomEnd) {
                            Box(
                                modifier = Modifier
                                    .size(52.dp)
                                    .clip(CircleShape)
                                    .background(MaterialTheme.colorScheme.primary),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(
                                    title.take(1).uppercase(),
                                    color = Color.White,
                                    fontWeight = FontWeight.Bold,
                                )
                            }
                            if (thread.online) {
                                Box(
                                    modifier = Modifier
                                        .size(12.dp)
                                        .clip(CircleShape)
                                        .background(Color(0xFF2DD4BF)),
                                )
                            }
                        }
                        Spacer(Modifier.width(12.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    title,
                                    style = MaterialTheme.typography.titleMedium,
                                    color = colors.textPrimary,
                                    modifier = Modifier.weight(1f),
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                Text(
                                    formatClock(thread.lastMessageAt),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = colors.textMuted,
                                )
                            }
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    thread.lastMessagePreview ?: "…",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = colors.textMuted,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    modifier = Modifier.weight(1f),
                                )
                                if (thread.unreadCount > 0) {
                                    Box(
                                        modifier = Modifier
                                            .padding(start = 8.dp)
                                            .clip(CircleShape)
                                            .background(MaterialTheme.colorScheme.primary)
                                            .padding(horizontal = 7.dp, vertical = 2.dp),
                                        contentAlignment = Alignment.Center,
                                    ) {
                                        Text(
                                            if (thread.unreadCount > 99) "99+" else thread.unreadCount.toString(),
                                            color = Color.White,
                                            fontSize = 11.sp,
                                            fontWeight = FontWeight.Bold,
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
}
