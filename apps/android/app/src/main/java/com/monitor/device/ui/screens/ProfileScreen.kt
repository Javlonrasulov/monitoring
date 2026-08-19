package com.monitor.device.ui.screens

import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material.icons.rounded.Smartphone
import androidx.compose.material.icons.rounded.WorkspacePremium
import androidx.compose.material3.MaterialTheme
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
import com.monitor.device.core.auth.TokenStore
import com.monitor.device.core.model.SubscriptionDto
import com.monitor.device.ui.components.InfoRow
import com.monitor.device.ui.components.MonitorCard
import com.monitor.device.ui.components.ScreenContainer
import com.monitor.device.ui.components.SecondaryButton
import com.monitor.device.ui.components.SectionHeader
import com.monitor.device.ui.components.StatusBadge
import com.monitor.device.ui.theme.MonitorTheme
import com.monitor.device.ui.theme.Spacing

@Composable
fun ProfileScreen(
    apiClient: DeviceApiClient,
    tokenStore: TokenStore,
    onUnpair: () -> Unit,
) {
    val colors = MonitorTheme.colors
    var sub by remember { mutableStateOf<SubscriptionDto?>(null) }

    LaunchedEffect(Unit) {
        runCatching { apiClient.subscription() }.onSuccess { sub = it }
    }

    val active = sub?.active == true
    ScreenContainer {
        Spacer(modifier = Modifier.size(Spacing.md))
        SectionHeader(
            title = stringResource(R.string.profile_subscription),
            icon = Icons.Rounded.WorkspacePremium,
        )
        Spacer(modifier = Modifier.size(Spacing.xs))
        MonitorCard {
            StatusBadge(
                text = sub?.status ?: "—",
                color = if (active) colors.success else colors.warning,
                animated = active,
            )
            Spacer(modifier = Modifier.size(Spacing.sm))
            InfoRow(stringResource(R.string.profile_status), sub?.status ?: "—")
            InfoRow(stringResource(R.string.profile_devices), sub?.devicesUsed ?: "—")
            InfoRow(
                stringResource(R.string.profile_expires),
                sub?.expiresAt?.take(10) ?: "—",
            )
            if (!active) {
                Spacer(modifier = Modifier.size(Spacing.sm))
                Text(
                    text = stringResource(R.string.profile_inactive_message),
                    style = MaterialTheme.typography.bodyMedium,
                    color = colors.textMuted,
                )
            }
        }

        Spacer(modifier = Modifier.size(Spacing.lg))
        MonitorCard {
            InfoRow(
                stringResource(R.string.profile_connected),
                tokenStore.deviceName() ?: stringResource(R.string.home_device_fallback),
                icon = Icons.Rounded.Smartphone,
            )
            InfoRow(
                stringResource(R.string.profile_notifications),
                stringResource(R.string.home_badge_live),
                icon = Icons.Rounded.Notifications,
            )
        }

        Spacer(modifier = Modifier.size(Spacing.lg))
        SecondaryButton(
            text = stringResource(R.string.profile_logout),
            contentColor = colors.danger,
            onClick = onUnpair,
        )
        Spacer(modifier = Modifier.size(Spacing.xxl))
    }
}
