package com.monitor.device.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ChatBubbleOutline
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.monitor.device.R
import com.monitor.device.core.api.DeviceApiClient
import com.monitor.device.core.model.ChatThreadDto
import com.monitor.device.ui.components.EmptyState
import com.monitor.device.ui.components.MonitorCard
import com.monitor.device.ui.theme.MonitorTheme
import com.monitor.device.ui.theme.Spacing
import kotlinx.coroutines.delay

@Composable
fun ChatsListScreen(
    apiClient: DeviceApiClient,
    onOpenThread: (String, String) -> Unit,
) {
    val colors = MonitorTheme.colors
    var query by remember { mutableStateOf("") }
    var threads by remember { mutableStateOf<List<ChatThreadDto>>(emptyList()) }

    LaunchedEffect(Unit) {
        while (true) {
            runCatching { apiClient.chats() }.onSuccess { threads = it }
            delay(4000)
        }
    }

    val filtered = threads.filter {
        val name = it.owner?.name.orEmpty() + it.peer?.name.orEmpty()
        query.isBlank() || name.contains(query, ignoreCase = true)
    }

    Column(modifier = Modifier.fillMaxSize().padding(horizontal = Spacing.md)) {
        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            modifier = Modifier.fillMaxWidth().padding(vertical = Spacing.sm),
            singleLine = true,
            leadingIcon = {
                androidx.compose.material3.Icon(Icons.Rounded.Search, contentDescription = null)
            },
            placeholder = { Text(stringResource(R.string.chats_search)) },
        )

        if (filtered.isEmpty()) {
            EmptyState(
                icon = Icons.Rounded.ChatBubbleOutline,
                title = stringResource(R.string.chats_empty_title),
                message = stringResource(R.string.chats_empty_message),
            )
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                items(filtered, key = { it.id }) { thread ->
                    val title = thread.owner?.name
                        ?: thread.peer?.name
                        ?: stringResource(R.string.chats_untitled)
                    MonitorCard(
                        modifier = Modifier.clickable { onOpenThread(thread.id, title) },
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(title, style = MaterialTheme.typography.titleMedium, color = colors.textPrimary)
                                Text(
                                    thread.lastMessagePreview ?: "…",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = colors.textMuted,
                                    maxLines = 1,
                                )
                            }
                            Text(
                                thread.lastMessageAt?.take(16)?.replace("T", " ") ?: "",
                                style = MaterialTheme.typography.labelSmall,
                                color = colors.textMuted,
                            )
                        }
                    }
                }
            }
        }
    }
}
