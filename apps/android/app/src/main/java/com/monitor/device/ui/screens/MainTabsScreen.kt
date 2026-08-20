package com.monitor.device.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Chat
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.rounded.Chat
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import kotlinx.coroutines.launch
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.monitor.device.R
import com.monitor.device.core.api.DeviceApiClient
import com.monitor.device.core.auth.TokenStore
import com.monitor.device.core.chat.ChatRealtime
import com.monitor.device.ui.components.TelegramDock
import com.monitor.device.ui.components.TelegramDockItem

@Composable
fun MainTabsScreen(
    apiClient: DeviceApiClient,
    tokenStore: TokenStore,
    onOpenChat: (String, String) -> Unit,
    onOpenCallCenter: (String, String) -> Unit,
    onUnpaired: () -> Unit,
    onWatchDevice: (String, String, String?) -> Unit,
) {
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var unread by rememberSaveable { mutableIntStateOf(0) }
    var supportUnread by rememberSaveable { mutableIntStateOf(0) }
    val scope = rememberCoroutineScope()
    val chatRealtime = remember { ChatRealtime(apiClient.apiBaseUrl, tokenStore) }
    DisposableEffect(Unit) {
        chatRealtime.connect { event, _ ->
            if (event == "chat.message" || event == "chat.read") {
                scope.launch {
                    runCatching { apiClient.supportSummary() }
                        .onSuccess { supportUnread = it.unreadCount }
                }
            }
        }
        onDispose { chatRealtime.disconnect() }
    }
    rememberMonitoringSession(
        tokenStore = tokenStore,
        onUnpaired = onUnpaired,
    )

    BackHandler(enabled = tab != 0) {
        tab = 0
    }

    Box(modifier = Modifier.fillMaxSize()) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(bottom = 88.dp),
        ) {
            when (tab) {
                0 -> ChatsListScreen(
                    apiClient = apiClient,
                    tokenStore = tokenStore,
                    onOpenThread = onOpenChat,
                    onUnreadChange = { unread = it },
                )
                1 -> SettingsScreen(
                    apiClient = apiClient,
                    onWatchDevice = onWatchDevice,
                )
                else -> ProfileScreen(
                    apiClient = apiClient,
                    tokenStore = tokenStore,
                    onUnpair = onUnpaired,
                    onOpenCallCenter = onOpenCallCenter,
                    isActive = tab == 2,
                    onSupportUnreadChange = { supportUnread = it },
                )
            }
        }

        TelegramDock(
            modifier = Modifier.align(Alignment.BottomCenter),
            selectedIndex = tab,
            onSelect = { tab = it },
            items = listOf(
                TelegramDockItem(
                    icon = if (tab == 0) {
                        Icons.Rounded.Chat
                    } else {
                        Icons.Outlined.Chat
                    },
                    labelRes = R.string.nav_chats,
                    badge = unread,
                ),
                TelegramDockItem(
                    icon = if (tab == 1) {
                        Icons.Rounded.Settings
                    } else {
                        Icons.Outlined.Settings
                    },
                    labelRes = R.string.nav_settings,
                ),
                TelegramDockItem(
                    icon = if (tab == 2) {
                        Icons.Rounded.Person
                    } else {
                        Icons.Outlined.Person
                    },
                    labelRes = R.string.nav_profile,
                    badge = supportUnread,
                ),
            ),
        )
    }
}
