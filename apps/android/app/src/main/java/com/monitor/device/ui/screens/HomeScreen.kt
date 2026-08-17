package com.monitor.device.ui.screens

import android.os.Build
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Android
import androidx.compose.material.icons.rounded.Apps
import androidx.compose.material.icons.rounded.Fingerprint
import androidx.compose.material.icons.rounded.LinkOff
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Smartphone
import androidx.compose.material.icons.rounded.Stop
import androidx.compose.material.icons.rounded.VerifiedUser
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import com.monitor.device.BuildConfig
import com.monitor.device.R
import com.monitor.device.core.auth.TokenStore
import com.monitor.device.monitoring.service.MonitoringForegroundService
import com.monitor.device.ui.components.AnimatedEntry
import com.monitor.device.ui.components.CardDivider
import com.monitor.device.ui.components.DangerButton
import com.monitor.device.ui.components.InfoRow
import com.monitor.device.ui.components.MonitorCard
import com.monitor.device.ui.components.MonitorConfirmDialog
import com.monitor.device.ui.components.PrimaryButton
import com.monitor.device.ui.components.ScreenContainer
import com.monitor.device.ui.components.SecondaryButton
import com.monitor.device.ui.components.SectionHeader
import com.monitor.device.ui.components.StatusBadge
import com.monitor.device.ui.theme.MonitorTheme
import com.monitor.device.ui.theme.Sizing
import com.monitor.device.ui.theme.Spacing
import kotlinx.coroutines.delay

@Composable
fun HomeScreen(
    tokenStore: TokenStore,
    onUnpaired: () -> Unit,
    onPermissionsRequired: () -> Unit,
) {
    val context = LocalContext.current
    val colors = MonitorTheme.colors
    var monitoring by remember { mutableStateOf(false) }
    var showUnpairDialog by remember { mutableStateOf(false) }

    val deviceName = tokenStore.deviceName() ?: stringResource(R.string.home_device_fallback)
    val deviceId = tokenStore.deviceId().orEmpty()

    // Paired devices start streaming as soon as Home is shown — no tap required.
    // Re-runs on every resume so a service killed in the background comes back.
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event != Lifecycle.Event.ON_RESUME) return@LifecycleEventObserver
            when {
                !tokenStore.isPaired() -> onUnpaired()
                !hasCapturePermissions(context) -> onPermissionsRequired()
                tokenStore.isAutoStartEnabled() -> {
                    MonitoringForegroundService.start(context)
                    monitoring = MonitoringForegroundService.isStarted()
                }
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    LaunchedEffect(lifecycleOwner) {
        while (tokenStore.isPaired()) {
            val live = MonitoringForegroundService.isStarted()
            monitoring = live
            val inForeground = lifecycleOwner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)
            if (
                !live &&
                inForeground &&
                tokenStore.isAutoStartEnabled() &&
                hasCapturePermissions(context)
            ) {
                MonitoringForegroundService.start(context)
            }
            delay(1_000)
        }
        onUnpaired()
    }

    ScreenContainer {
        Spacer(modifier = Modifier.size(Spacing.xs))

        AnimatedEntry {
            StatusHeroCard(monitoring = monitoring, deviceName = deviceName)
        }

        Spacer(modifier = Modifier.size(Spacing.md))

        AnimatedEntry(delayMillis = 70) {
            Column {
                AnimatedContent(
                    targetState = monitoring,
                    transitionSpec = {
                        fadeIn(tween(180)) togetherWith fadeOut(tween(140))
                    },
                    label = "primaryAction",
                ) { active ->
                    if (active) {
                        DangerButton(
                            text = stringResource(R.string.home_stop_monitoring),
                            icon = Icons.Rounded.Stop,
                            onClick = {
                                MonitoringForegroundService.stop(context)
                                tokenStore.setAutoStartEnabled(false)
                                monitoring = false
                            },
                        )
                    } else {
                        PrimaryButton(
                            text = stringResource(R.string.home_start_monitoring),
                            icon = Icons.Rounded.PlayArrow,
                            onClick = {
                                tokenStore.setAutoStartEnabled(true)
                                MonitoringForegroundService.start(context)
                            },
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.size(Spacing.lg))

        AnimatedEntry(delayMillis = 140) {
            Column {
                SectionHeader(
                    title = stringResource(R.string.home_section_device),
                    icon = Icons.Rounded.Smartphone,
                )
                Spacer(modifier = Modifier.size(Spacing.xs))
                MonitorCard(
                    contentPadding = PaddingValues(
                        horizontal = Spacing.lg,
                        vertical = Spacing.xs,
                    ),
                ) {
                    InfoRow(
                        label = stringResource(R.string.home_field_name),
                        value = deviceName,
                        icon = Icons.Rounded.Smartphone,
                    )
                    CardDivider()
                    InfoRow(
                        label = stringResource(R.string.home_field_id),
                        value = deviceId.ifBlank { "—" },
                        icon = Icons.Rounded.Fingerprint,
                    )
                    CardDivider()
                    InfoRow(
                        label = stringResource(R.string.home_field_model),
                        value = "${Build.MANUFACTURER} ${Build.MODEL}",
                        icon = Icons.Rounded.Smartphone,
                    )
                    CardDivider()
                    InfoRow(
                        label = stringResource(R.string.home_field_android),
                        value = Build.VERSION.RELEASE.orEmpty().ifBlank { "—" },
                        icon = Icons.Rounded.Android,
                    )
                    CardDivider()
                    InfoRow(
                        label = stringResource(R.string.home_field_app_version),
                        value = BuildConfig.VERSION_NAME,
                        icon = Icons.Rounded.Apps,
                    )
                }
            }
        }

        Spacer(modifier = Modifier.size(Spacing.lg))

        AnimatedEntry(delayMillis = 210) {
            Column {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(Spacing.xs),
                    verticalAlignment = Alignment.Top,
                ) {
                    Icon(
                        imageVector = Icons.Rounded.VerifiedUser,
                        contentDescription = null,
                        tint = colors.textMuted,
                        modifier = Modifier
                            .padding(top = 2.dp)
                            .size(Sizing.iconSm),
                    )
                    Text(
                        text = stringResource(R.string.home_transparency_note),
                        style = MaterialTheme.typography.bodySmall,
                        color = colors.textMuted,
                    )
                }

                Spacer(modifier = Modifier.size(Spacing.md))

                SecondaryButton(
                    text = stringResource(R.string.home_unpair),
                    icon = Icons.Rounded.LinkOff,
                    contentColor = colors.danger,
                    onClick = { showUnpairDialog = true },
                )
            }
        }

        Spacer(
            modifier = Modifier
                .size(Spacing.xxl)
                .navigationBarsPadding(),
        )
    }

    if (showUnpairDialog) {
        MonitorConfirmDialog(
            title = stringResource(R.string.home_unpair_title),
            message = stringResource(R.string.home_unpair_message),
            confirmText = stringResource(R.string.home_unpair_confirm),
            dismissText = stringResource(R.string.common_cancel),
            icon = Icons.Rounded.LinkOff,
            destructive = true,
            onConfirm = {
                showUnpairDialog = false
                if (monitoring) {
                    MonitoringForegroundService.stop(context)
                    monitoring = false
                }
                onUnpaired()
            },
            onDismiss = { showUnpairDialog = false },
        )
    }
}

/**
 * The screen's focal point. Switches from a calm surface to the brand gradient
 * when a capture is live, so the device state is readable at a glance.
 */
@Composable
private fun StatusHeroCard(
    monitoring: Boolean,
    deviceName: String,
) {
    val colors = MonitorTheme.colors
    val onHero = if (monitoring) Color.White else colors.textPrimary
    val onHeroMuted = if (monitoring) Color.White.copy(alpha = 0.78f) else colors.textMuted

    MonitorCard(
        background = if (monitoring) colors.heroGradient else SolidColor(colors.surfaceElevated),
        contentPadding = PaddingValues(Spacing.lg),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = stringResource(R.string.home_status_label),
                style = MaterialTheme.typography.labelSmall,
                color = onHeroMuted,
            )
            StatusBadge(
                text = if (monitoring) {
                    stringResource(R.string.home_badge_live)
                } else {
                    stringResource(R.string.home_badge_idle)
                },
                color = if (monitoring) colors.success else colors.textMuted,
                animated = monitoring,
                onDark = monitoring,
            )
        }

        Spacer(modifier = Modifier.size(Spacing.sm))

        AnimatedContent(
            targetState = monitoring,
            transitionSpec = { fadeIn(tween(200)) togetherWith fadeOut(tween(160)) },
            label = "heroStatus",
        ) { active ->
            Column {
                Text(
                    text = if (active) {
                        stringResource(R.string.home_status_active)
                    } else {
                        stringResource(R.string.home_status_idle)
                    },
                    style = MaterialTheme.typography.headlineMedium,
                    color = onHero,
                )
                Spacer(modifier = Modifier.size(Spacing.xs))
                Text(
                    text = if (active) {
                        stringResource(R.string.home_hint_active)
                    } else {
                        stringResource(R.string.home_hint_idle)
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = onHeroMuted,
                )
            }
        }

        Spacer(modifier = Modifier.size(Spacing.md))

        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Spacing.xs),
        ) {
            Icon(
                imageVector = Icons.Rounded.Smartphone,
                contentDescription = null,
                tint = onHeroMuted,
                modifier = Modifier.size(Sizing.iconSm),
            )
            Text(
                text = deviceName,
                style = MaterialTheme.typography.titleSmall,
                color = onHeroMuted,
            )
        }
    }
}
