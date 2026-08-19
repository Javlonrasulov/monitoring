package com.monitor.device.ui.screens

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.Link
import androidx.compose.material.icons.rounded.QrCode2
import androidx.compose.material.icons.rounded.Videocam
import androidx.compose.material.icons.rounded.WorkspacePremium
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardCapitalization
import com.monitor.device.R
import com.monitor.device.core.api.DeviceApiClient
import com.monitor.device.core.model.LinkedDeviceDto
import com.monitor.device.core.model.PairingCodeResponse
import com.monitor.device.core.model.SubscriptionDto
import com.monitor.device.ui.components.ErrorBanner
import com.monitor.device.ui.components.MonitorCard
import com.monitor.device.ui.components.MonitorTextField
import com.monitor.device.ui.components.PrimaryButton
import com.monitor.device.ui.components.ScreenContainer
import com.monitor.device.ui.components.SecondaryButton
import com.monitor.device.ui.components.SectionHeader
import com.monitor.device.ui.components.StatusBadge
import com.monitor.device.ui.theme.MonitorTheme
import com.monitor.device.ui.theme.Spacing
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.launch

@Composable
fun SettingsScreen(
    apiClient: DeviceApiClient,
    onWatchDevice: (String, String) -> Unit,
) {
    val colors = MonitorTheme.colors
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var sub by remember { mutableStateOf<SubscriptionDto?>(null) }
    var linked by remember { mutableStateOf<List<LinkedDeviceDto>>(emptyList()) }
    var invite by remember { mutableStateOf<PairingCodeResponse?>(null) }
    var joinCode by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var info by remember { mutableStateOf<String?>(null) }
    var loadingCode by remember { mutableStateOf(false) }
    var loadingLink by remember { mutableStateOf(false) }
    var buying by remember { mutableStateOf<String?>(null) }

    fun reload() {
        scope.launch {
            runCatching { apiClient.subscriptionPeek() }.onSuccess { sub = it }
            runCatching { apiClient.linkedDevices() }.onSuccess { linked = it }
        }
    }

    LaunchedEffect(Unit) { reload() }

    val failGeneric = stringResource(R.string.pair_failed)
    val copied = stringResource(R.string.settings_code_copied)
    val linkedOk = stringResource(R.string.settings_link_success)

    ScreenContainer {
        Spacer(modifier = Modifier.size(Spacing.md))
        SectionHeader(
            title = stringResource(R.string.settings_link_section),
            icon = Icons.Rounded.QrCode2,
        )
        Spacer(modifier = Modifier.size(Spacing.xs))
        if (error != null) {
            ErrorBanner(title = stringResource(R.string.pair_error_title), message = error.orEmpty())
            Spacer(modifier = Modifier.size(Spacing.sm))
        }
        if (info != null) {
            Text(text = info.orEmpty(), style = MaterialTheme.typography.bodyMedium, color = colors.success)
            Spacer(modifier = Modifier.size(Spacing.sm))
        }

        MonitorCard {
            Text(
                text = stringResource(R.string.settings_share_hint),
                style = MaterialTheme.typography.bodyMedium,
                color = colors.textMuted,
            )
            Spacer(modifier = Modifier.size(Spacing.md))
            if (invite != null) {
                Text(
                    text = invite!!.code,
                    style = MaterialTheme.typography.headlineMedium,
                    color = colors.textPrimary,
                )
                Spacer(modifier = Modifier.size(Spacing.sm))
                SecondaryButton(
                    text = stringResource(R.string.settings_copy_code),
                    icon = Icons.Rounded.ContentCopy,
                    onClick = {
                        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                        clipboard.setPrimaryClip(ClipData.newPlainText("code", invite!!.code))
                        info = copied
                    },
                )
                Spacer(modifier = Modifier.size(Spacing.sm))
            }
            PrimaryButton(
                text = stringResource(R.string.settings_generate_code),
                loading = loadingCode,
                onClick = {
                    loadingCode = true
                    error = null
                    scope.launch {
                        runCatching { apiClient.createPairingCode() }
                            .onSuccess { invite = it }
                            .onFailure { error = failGeneric }
                        loadingCode = false
                    }
                },
            )
        }

        Spacer(modifier = Modifier.size(Spacing.lg))
        MonitorCard {
            SectionHeader(
                title = stringResource(R.string.settings_enter_code_title),
                icon = Icons.Rounded.Link,
            )
            Spacer(modifier = Modifier.size(Spacing.sm))
            Text(
                text = stringResource(R.string.settings_enter_code_hint),
                style = MaterialTheme.typography.bodyMedium,
                color = colors.textMuted,
            )
            Spacer(modifier = Modifier.size(Spacing.md))
            MonitorTextField(
                value = joinCode,
                onValueChange = { joinCode = it.uppercase().replace(" ", "").take(24) },
                label = stringResource(R.string.pair_code_label),
                placeholder = stringResource(R.string.pair_code_placeholder),
                enabled = !loadingLink,
                leadingIcon = Icons.Rounded.Link,
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
            )
            Spacer(modifier = Modifier.size(Spacing.md))
            SecondaryButton(
                text = stringResource(R.string.settings_connect_code),
                enabled = joinCode.length >= 4 && !loadingLink,
                onClick = {
                    loadingLink = true
                    error = null
                    scope.launch {
                        runCatching { apiClient.linkDevice(joinCode) }
                            .onSuccess {
                                info = linkedOk
                                joinCode = ""
                                reload()
                            }
                            .onFailure { error = failGeneric }
                        loadingLink = false
                    }
                },
            )
        }

        if (linked.isNotEmpty()) {
            Spacer(modifier = Modifier.size(Spacing.lg))
            SectionHeader(
                title = stringResource(R.string.settings_linked_section),
                icon = Icons.Rounded.Videocam,
            )
            Spacer(modifier = Modifier.size(Spacing.xs))
            linked.forEach { device ->
                MonitorCard {
                    Text(device.name, style = MaterialTheme.typography.titleSmall, color = colors.textPrimary)
                    Text(
                        device.status ?: "—",
                        style = MaterialTheme.typography.bodySmall,
                        color = colors.textMuted,
                    )
                    Spacer(modifier = Modifier.size(Spacing.sm))
                    PrimaryButton(
                        text = stringResource(R.string.settings_watch_live),
                        onClick = { onWatchDevice(device.id, device.name) },
                    )
                }
                Spacer(modifier = Modifier.size(Spacing.sm))
            }
        }

        Spacer(modifier = Modifier.size(Spacing.lg))
        SectionHeader(
            title = stringResource(R.string.settings_plans_section),
            icon = Icons.Rounded.WorkspacePremium,
        )
        Spacer(modifier = Modifier.size(Spacing.xs))
        val active = sub?.active == true
        MonitorCard {
            StatusBadge(
                text = sub?.plan ?: "TRIAL",
                color = if (active) colors.success else colors.warning,
                animated = active,
            )
            Spacer(modifier = Modifier.size(Spacing.sm))
            Text(
                text = stringResource(
                    R.string.settings_plan_status,
                    sub?.status ?: "—",
                    formatSubscriptionExpiry(sub?.expiresAt),
                ),
                style = MaterialTheme.typography.bodyMedium,
                color = colors.textMuted,
            )
            if (sub?.trial == true) {
                Spacer(modifier = Modifier.size(Spacing.xs))
                Text(
                    text = stringResource(R.string.settings_trial_message),
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.textMuted,
                )
            }
        }

        Spacer(modifier = Modifier.size(Spacing.sm))
        PlanCard(
            title = stringResource(R.string.settings_plan_pro),
            price = "$${sub?.priceProUsd ?: 25}",
            body = stringResource(R.string.settings_plan_pro_body),
            loading = buying == "PRO",
            enabled = buying == null && sub?.plan != "PRO",
            onBuy = {
                buying = "PRO"
                error = null
                scope.launch {
                    runCatching { apiClient.purchasePlan("PRO") }
                        .onSuccess { sub = it }
                        .onFailure { error = failGeneric }
                    buying = null
                }
            },
        )
        Spacer(modifier = Modifier.size(Spacing.sm))
        PlanCard(
            title = stringResource(R.string.settings_plan_pro_plus),
            price = "$${sub?.priceProPlusUsd ?: 25}",
            body = stringResource(R.string.settings_plan_pro_plus_body),
            loading = buying == "PRO_PLUS",
            enabled = buying == null && sub?.plan != "PRO_PLUS",
            onBuy = {
                buying = "PRO_PLUS"
                error = null
                scope.launch {
                    runCatching { apiClient.purchasePlan("PRO_PLUS") }
                        .onSuccess { sub = it }
                        .onFailure { error = failGeneric }
                    buying = null
                }
            },
        )
        Spacer(modifier = Modifier.size(Spacing.xxl))
    }
}

@Composable
private fun PlanCard(
    title: String,
    price: String,
    body: String,
    loading: Boolean,
    enabled: Boolean,
    onBuy: () -> Unit,
) {
    val colors = MonitorTheme.colors
    MonitorCard {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleMedium, color = colors.textPrimary)
                Text(price, style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
            }
        }
        Spacer(modifier = Modifier.size(Spacing.xs))
        Text(body, style = MaterialTheme.typography.bodyMedium, color = colors.textMuted)
        Spacer(modifier = Modifier.size(Spacing.md))
        PrimaryButton(
            text = stringResource(R.string.settings_buy),
            onClick = onBuy,
            enabled = enabled,
            loading = loading,
        )
    }
}

private val subscriptionExpiryFormat: DateTimeFormatter =
    DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm").withZone(ZoneId.systemDefault())

internal fun formatSubscriptionExpiry(iso: String?): String {
    if (iso.isNullOrBlank()) return "—"
    return runCatching {
        subscriptionExpiryFormat.format(Instant.parse(iso))
    }.getOrElse {
        iso.take(16).replace('T', ' ')
    }
}
