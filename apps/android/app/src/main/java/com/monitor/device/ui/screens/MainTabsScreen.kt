package com.monitor.device.ui.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Chat
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.Smartphone
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.monitor.device.R
import com.monitor.device.core.api.DeviceApiClient
import com.monitor.device.core.auth.TokenStore

@Composable
fun MainTabsScreen(
    apiClient: DeviceApiClient,
    tokenStore: TokenStore,
    onOpenChat: (String, String) -> Unit,
    onUnpaired: () -> Unit,
    onPermissionsRequired: () -> Unit,
) {
    var tab by rememberSaveable { mutableIntStateOf(0) }

    Column(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.weight(1f)) {
            when (tab) {
                0 -> ChatsListScreen(apiClient = apiClient, onOpenThread = onOpenChat)
                1 -> HomeScreen(
                    tokenStore = tokenStore,
                    onUnpaired = onUnpaired,
                    onPermissionsRequired = onPermissionsRequired,
                )
                else -> ProfileScreen(
                    apiClient = apiClient,
                    tokenStore = tokenStore,
                    onUnpair = onUnpaired,
                )
            }
        }
        NavigationBar(modifier = Modifier.navigationBarsPadding()) {
            NavigationBarItem(
                selected = tab == 0,
                onClick = { tab = 0 },
                icon = { Icon(Icons.Rounded.Chat, contentDescription = null) },
                label = { Text(stringResource(R.string.nav_chats)) },
            )
            NavigationBarItem(
                selected = tab == 1,
                onClick = { tab = 1 },
                icon = { Icon(Icons.Rounded.Smartphone, contentDescription = null) },
                label = { Text(stringResource(R.string.nav_devices)) },
            )
            NavigationBarItem(
                selected = tab == 2,
                onClick = { tab = 2 },
                icon = { Icon(Icons.Rounded.Person, contentDescription = null) },
                label = { Text(stringResource(R.string.nav_profile)) },
            )
        }
    }
}
