package com.monitor.device.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.monitor.device.R
import com.monitor.device.core.api.DeviceApiClient
import com.monitor.device.core.model.ChatMessageDto
import com.monitor.device.ui.theme.MonitorTheme
import com.monitor.device.ui.theme.Spacing
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
fun ChatThreadScreen(
    apiClient: DeviceApiClient,
    threadId: String,
    title: String,
    onBack: () -> Unit,
) {
    val colors = MonitorTheme.colors
    var messages by remember { mutableStateOf<List<ChatMessageDto>>(emptyList()) }
    var draft by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    val listState = rememberLazyListState()

    LaunchedEffect(threadId) {
        runCatching { apiClient.readChat(threadId) }
        while (true) {
            runCatching { apiClient.chatMessages(threadId) }
                .onSuccess { messages = it.items }
            delay(2500)
        }
    }

    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) {
            listState.animateScrollToItem(messages.lastIndex)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .imePadding()
            .navigationBarsPadding(),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = Spacing.md, vertical = Spacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = stringResource(R.string.common_close))
            }
            Text(
                text = title,
                style = MaterialTheme.typography.titleLarge,
                color = colors.textPrimary,
            )
        }
        LazyColumn(
            state = listState,
            modifier = Modifier.weight(1f).padding(horizontal = Spacing.md),
            verticalArrangement = Arrangement.spacedBy(Spacing.xs),
        ) {
            items(messages, key = { it.id }) { message ->
                val mine = message.senderUserId != null
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start,
                ) {
                    Text(
                        text = message.text.orEmpty(),
                        style = MaterialTheme.typography.bodyLarge,
                        color = if (mine) MaterialTheme.colorScheme.onPrimary else colors.textPrimary,
                        modifier = Modifier
                            .background(
                                if (mine) MaterialTheme.colorScheme.primary else colors.surfaceMuted,
                                RoundedCornerShape(16.dp),
                            )
                            .padding(horizontal = 14.dp, vertical = 10.dp),
                    )
                }
            }
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            OutlinedTextField(
                value = draft,
                onValueChange = { draft = it },
                modifier = Modifier.weight(1f),
                placeholder = { Text(stringResource(R.string.chat_placeholder)) },
            )
            IconButton(
                onClick = {
                    val text = draft.trim()
                    if (text.isEmpty()) return@IconButton
                    draft = ""
                    scope.launch {
                        runCatching { apiClient.sendChat(threadId, text) }
                        runCatching { apiClient.chatMessages(threadId) }
                            .onSuccess { messages = it.items }
                    }
                },
            ) {
                Icon(Icons.AutoMirrored.Rounded.Send, contentDescription = stringResource(R.string.chat_send))
            }
        }
    }
}
