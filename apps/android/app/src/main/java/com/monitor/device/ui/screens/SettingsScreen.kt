package com.monitor.device.ui.screens

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.CreditCard
import androidx.compose.material.icons.rounded.Link
import androidx.compose.material.icons.rounded.QrCode2
import androidx.compose.material.icons.rounded.Videocam
import androidx.compose.material.icons.rounded.WorkspacePremium
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.monitor.device.R
import com.monitor.device.core.api.DeviceApiClient
import com.monitor.device.core.model.LinkedDeviceDto
import com.monitor.device.core.model.PairingCodeResponse
import com.monitor.device.core.model.PaymentInvoiceDto
import com.monitor.device.core.model.SubscriptionDto
import com.monitor.device.ui.components.DangerButton
import com.monitor.device.ui.components.ErrorBanner
import com.monitor.device.ui.components.MonitorCard
import com.monitor.device.ui.components.MonitorConfirmDialog
import com.monitor.device.ui.components.MonitorTextField
import com.monitor.device.ui.components.PrimaryButton
import com.monitor.device.ui.components.ScreenContainer
import com.monitor.device.ui.components.SecondaryButton
import com.monitor.device.ui.components.SectionHeader
import com.monitor.device.ui.components.StatusBadge
import com.monitor.device.ui.theme.MonitorTheme
import com.monitor.device.ui.theme.Spacing
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
fun SettingsScreen(
    apiClient: DeviceApiClient,
    onWatchDevice: (String, String, String?) -> Unit,
    onOpenHistory: (String, String) -> Unit = { _, _ -> },
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
    var unlinkTarget by remember { mutableStateOf<LinkedDeviceDto?>(null) }
    var unlinking by remember { mutableStateOf(false) }
    var invoice by remember { mutableStateOf<PaymentInvoiceDto?>(null) }
    var pendingCheckoutUrl by remember { mutableStateOf<String?>(null) }
    var showPayGuide by remember { mutableStateOf(false) }
    var clock by remember { mutableLongStateOf(System.currentTimeMillis()) }

    val failGeneric = stringResource(R.string.pair_failed)
    val copied = stringResource(R.string.settings_code_copied)
    val addressCopied = stringResource(R.string.settings_address_copied)
    val linkedOk = stringResource(R.string.settings_link_success)
    val unlinkedOk = stringResource(R.string.settings_unlink_success)
    val paySuccess = stringResource(R.string.settings_pay_success)

    fun openPayGuide(url: String?) {
        val next = url?.takeIf { it.isNotBlank() } ?: return
        pendingCheckoutUrl = next
        showPayGuide = true
    }

    fun openGuardarianInBrowser(url: String) {
        val address = invoice?.payAddress.orEmpty()
        if (address.isNotBlank()) {
            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            clipboard.setPrimaryClip(ClipData.newPlainText("usdt", address))
            info = addressCopied
        }
        runCatching {
            context.startActivity(
                Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                },
            )
        }.onFailure {
            error = DeviceApiClient.errorMessage(it, failGeneric)
        }
    }

    fun reload() {
        scope.launch {
            runCatching { apiClient.subscriptionPeek() }.onSuccess { sub = it }
            runCatching { apiClient.linkedDevices() }.onSuccess { linked = it }
        }
    }

    LaunchedEffect(Unit) { reload() }

    LaunchedEffect(invoice?.id) {
        val id = invoice?.id ?: return@LaunchedEffect
        while (true) {
            delay(1_000)
            clock = System.currentTimeMillis()
        }
    }

    LaunchedEffect(invoice?.id) {
        val id = invoice?.id ?: return@LaunchedEffect
        while (true) {
            val latest = runCatching { apiClient.paymentInvoice(id) }.getOrNull()
            if (latest != null) {
                invoice = latest
                val status = latest.status.orEmpty()
                if (latest.paid || status == "FINISHED") {
                    info = paySuccess
                    showPayGuide = false
                    pendingCheckoutUrl = null
                    reload()
                    break
                }
                if (status == "EXPIRED" || status == "FAILED") break
            }
            delay(4_000)
        }
    }

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
                            .onFailure { error = DeviceApiClient.errorMessage(it, failGeneric) }
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
                            .onFailure { error = DeviceApiClient.errorMessage(it, failGeneric) }
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
                        onClick = { onWatchDevice(device.id, device.name, device.cameraFacing) },
                    )
                    if (sub?.canRecordings == true) {
                        Spacer(modifier = Modifier.size(Spacing.sm))
                        SecondaryButton(
                            text = stringResource(R.string.history_title),
                            onClick = { onOpenHistory(device.id, device.name) },
                        )
                    }
                    Spacer(modifier = Modifier.size(Spacing.sm))
                    DangerButton(
                        text = stringResource(R.string.settings_unlink),
                        enabled = !unlinking,
                        onClick = { unlinkTarget = device },
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

        val planName = sub?.plan.orEmpty()
        val hasActivePro = active && planName == "PRO"
        val hasActiveProPlus = active && planName == "PRO_PLUS"
        if (!hasActivePro && !hasActiveProPlus) {
            Spacer(modifier = Modifier.size(Spacing.sm))
            PlanCard(
                title = stringResource(R.string.settings_plan_pro),
                price = "$${sub?.priceProUsd ?: 25}",
                body = stringResource(R.string.settings_plan_pro_body),
                loading = buying == "PRO",
                enabled = buying == null,
                hint = null,
                onBuy = {
                    buying = "PRO"
                    error = null
                    scope.launch {
                        runCatching { apiClient.createPaymentInvoice("PRO") }
                            .onSuccess {
                                invoice = it
                                openPayGuide(it.checkoutUrl?.takeIf { url -> url.isNotBlank() } ?: it.guardarianUrl)
                            }
                            .onFailure { error = DeviceApiClient.errorMessage(it, failGeneric) }
                        buying = null
                    }
                },
            )
        }
        if (!hasActiveProPlus) {
            Spacer(modifier = Modifier.size(Spacing.sm))
            PlanCard(
                title = stringResource(R.string.settings_plan_pro_plus),
                price = "$${sub?.priceProPlusUsd ?: 25}",
                body = stringResource(R.string.settings_plan_pro_plus_body),
                loading = buying == "PRO_PLUS",
                enabled = buying == null && hasActivePro,
                hint = if (hasActivePro) null
                else stringResource(R.string.settings_pro_plus_locked),
                onBuy = {
                    buying = "PRO_PLUS"
                    error = null
                    scope.launch {
                        runCatching { apiClient.createPaymentInvoice("PRO_PLUS") }
                            .onSuccess {
                                invoice = it
                                openPayGuide(it.checkoutUrl?.takeIf { url -> url.isNotBlank() } ?: it.guardarianUrl)
                            }
                            .onFailure { error = DeviceApiClient.errorMessage(it, failGeneric) }
                        buying = null
                    }
                },
            )
        }

        invoice?.let { pay ->
            Spacer(modifier = Modifier.size(Spacing.lg))
            PaymentInvoiceCard(
                invoice = pay,
                clockMs = clock,
                onCopy = {
                    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                    clipboard.setPrimaryClip(ClipData.newPlainText("usdt", pay.payAddress))
                    info = addressCopied
                },
                onPayCard = {
                    openPayGuide(pay.checkoutUrl?.takeIf { it.isNotBlank() } ?: pay.guardarianUrl)
                },
            )
        }
        Spacer(modifier = Modifier.size(Spacing.xxl))
    }

    unlinkTarget?.let { device ->
        MonitorConfirmDialog(
            title = stringResource(R.string.settings_unlink_title),
            message = stringResource(R.string.settings_unlink_message, device.name),
            confirmText = stringResource(R.string.settings_unlink_confirm),
            dismissText = stringResource(R.string.common_cancel),
            destructive = true,
            onDismiss = { if (!unlinking) unlinkTarget = null },
            onConfirm = {
                if (unlinking) return@MonitorConfirmDialog
                unlinking = true
                error = null
                unlinkTarget = null
                scope.launch {
                    runCatching { apiClient.unlinkDevice(device.id) }
                        .onSuccess {
                            info = unlinkedOk
                            reload()
                        }
                        .onFailure { error = DeviceApiClient.errorMessage(it, failGeneric) }
                    unlinking = false
                }
            },
        )
    }

    if (showPayGuide) {
        Dialog(
            onDismissRequest = {
                showPayGuide = false
                pendingCheckoutUrl = null
            },
            properties = DialogProperties(
                usePlatformDefaultWidth = true,
                dismissOnClickOutside = false,
                dismissOnBackPress = true,
            ),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(colors.surfaceElevated)
                    .padding(Spacing.md),
            ) {
                Text(
                    text = stringResource(R.string.settings_pay_guide_title),
                    style = MaterialTheme.typography.titleMedium,
                    color = colors.textPrimary,
                )
                Spacer(modifier = Modifier.size(Spacing.sm))
                Text(
                    text = stringResource(R.string.settings_pay_guide_body),
                    style = MaterialTheme.typography.bodyMedium,
                    color = colors.textPrimary,
                )
                Spacer(modifier = Modifier.size(Spacing.md))
                PrimaryButton(
                    text = stringResource(R.string.settings_pay_guide_understood),
                    icon = Icons.Rounded.CreditCard,
                    onClick = {
                        val url = pendingCheckoutUrl
                        showPayGuide = false
                        pendingCheckoutUrl = null
                        if (!url.isNullOrBlank()) openGuardarianInBrowser(url)
                    },
                )
                Spacer(modifier = Modifier.size(Spacing.sm))
                SecondaryButton(
                    text = stringResource(R.string.settings_pay_guide_cancel),
                    onClick = {
                        showPayGuide = false
                        pendingCheckoutUrl = null
                    },
                )
            }
        }
    }
}

@Composable
private fun PlanCard(
    title: String,
    price: String,
    body: String,
    loading: Boolean,
    enabled: Boolean,
    hint: String? = null,
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
        if (!hint.isNullOrBlank()) {
            Spacer(modifier = Modifier.size(Spacing.xs))
            Text(hint, style = MaterialTheme.typography.bodySmall, color = colors.warning)
        }
        Spacer(modifier = Modifier.size(Spacing.md))
        PrimaryButton(
            text = stringResource(R.string.settings_buy),
            onClick = onBuy,
            enabled = enabled,
            loading = loading,
            icon = Icons.Rounded.CreditCard,
        )
    }
}

@Composable
private fun PaymentInvoiceCard(
    invoice: PaymentInvoiceDto,
    clockMs: Long,
    onCopy: () -> Unit,
    onPayCard: () -> Unit,
) {
    val colors = MonitorTheme.colors
    val status = invoice.status.orEmpty()
    val statusText = when {
        invoice.paid || status == "FINISHED" -> stringResource(R.string.settings_pay_success)
        status == "CONFIRMING" -> stringResource(R.string.settings_pay_confirming)
        status == "EXPIRED" -> stringResource(R.string.settings_pay_expired)
        status == "FAILED" -> stringResource(R.string.settings_pay_failed)
        else -> stringResource(R.string.settings_pay_waiting)
    }
    var showCrypto by remember { mutableStateOf(false) }
    val checkoutReady = !invoice.checkoutUrl.isNullOrBlank() || !invoice.guardarianUrl.isNullOrBlank()
    MonitorCard {
        Text(
            text = stringResource(R.string.settings_pay_title),
            style = MaterialTheme.typography.titleMedium,
            color = colors.textPrimary,
        )
        Spacer(modifier = Modifier.size(Spacing.xs))
        Text(
            text = stringResource(R.string.settings_pay_hint),
            style = MaterialTheme.typography.bodySmall,
            color = colors.textMuted,
        )
        Spacer(modifier = Modifier.size(Spacing.sm))
        Text(
            text = stringResource(R.string.settings_pay_timer, formatRemaining(invoice.expiresAt, clockMs)),
            style = MaterialTheme.typography.bodyMedium,
            color = colors.warning,
        )
        Spacer(modifier = Modifier.size(Spacing.sm))
        Text(text = statusText, style = MaterialTheme.typography.bodyMedium, color = colors.textSecondary)
        Spacer(modifier = Modifier.size(Spacing.md))
        PrimaryButton(
            text = stringResource(R.string.settings_pay_visa),
            icon = Icons.Rounded.CreditCard,
            onClick = onPayCard,
            enabled = checkoutReady && !invoice.paid && status != "EXPIRED" && status != "FAILED",
        )
        if (invoice.payAddress.isNotBlank()) {
            Spacer(modifier = Modifier.size(Spacing.sm))
            SecondaryButton(
                text = stringResource(
                    if (showCrypto) R.string.settings_pay_hide_crypto else R.string.settings_pay_show_crypto,
                ),
                onClick = { showCrypto = !showCrypto },
            )
            if (showCrypto) {
                Spacer(modifier = Modifier.size(Spacing.sm))
                Text(
                    text = stringResource(
                        R.string.settings_pay_crypto_help,
                        invoice.payAmount.ifBlank { invoice.priceUsd?.toString().orEmpty() },
                        invoice.payCurrency.ifBlank { "USDT" }.uppercase(),
                        invoice.network?.ifBlank { null } ?: "TRC20",
                    ),
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.textMuted,
                )
                Spacer(modifier = Modifier.size(Spacing.sm))
                Text(
                    text = stringResource(
                        R.string.settings_pay_network,
                        invoice.network?.ifBlank { null } ?: "TRC20",
                    ),
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.textSecondary,
                )
                Spacer(modifier = Modifier.size(Spacing.xs))
                Text(
                    text = stringResource(
                        R.string.settings_pay_amount,
                        invoice.payAmount.ifBlank { invoice.priceUsd?.toString().orEmpty() },
                        invoice.payCurrency.ifBlank { "USDT" }.uppercase(),
                    ),
                    style = MaterialTheme.typography.bodyMedium,
                    color = colors.textPrimary,
                )
                Spacer(modifier = Modifier.size(Spacing.sm))
                Text(
                    text = invoice.payAddress,
                    style = MaterialTheme.typography.bodyMedium,
                    color = colors.textPrimary,
                )
                Spacer(modifier = Modifier.size(Spacing.sm))
                SecondaryButton(
                    text = stringResource(R.string.settings_copy_address),
                    icon = Icons.Rounded.ContentCopy,
                    onClick = onCopy,
                )
            }
        }
    }
}

private fun formatRemaining(expiresAt: String?, clockMs: Long): String {
    if (expiresAt.isNullOrBlank()) return "—"
    val end = runCatching { Instant.parse(expiresAt) }.getOrNull() ?: return "—"
    val left = Duration.between(Instant.ofEpochMilli(clockMs), end)
    if (left.isNegative || left.isZero) return "00:00"
    val minutes = left.toMinutes()
    val seconds = left.seconds % 60
    return "%02d:%02d".format(minutes, seconds)
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
