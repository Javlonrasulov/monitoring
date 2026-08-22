package com.monitor.device.ui.screens

import android.os.Build
import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.HeadsetMic
import androidx.compose.material.icons.rounded.Link
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.Phone
import androidx.compose.material.icons.rounded.Shield
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material.icons.rounded.VisibilityOff
import androidx.compose.material.icons.rounded.VpnKey
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import com.monitor.device.BuildConfig
import com.monitor.device.R
import com.monitor.device.core.api.DeviceApiClient
import com.monitor.device.core.auth.InstallId
import com.monitor.device.core.model.GuestSupportRequest
import com.monitor.device.core.model.PairRequest
import com.monitor.device.ui.components.ErrorBanner
import com.monitor.device.ui.components.MonitorCard
import com.monitor.device.ui.components.MonitorTextField
import com.monitor.device.ui.components.PrimaryButton
import com.monitor.device.ui.components.ScreenContainer
import com.monitor.device.ui.components.SectionHeader
import com.monitor.device.ui.theme.MonitorTheme
import com.monitor.device.ui.theme.Sizing
import com.monitor.device.ui.theme.Spacing
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
fun PairingScreen(
    apiClient: DeviceApiClient,
    onPaired: () -> Unit,
    onOpenSupport: (threadId: String, title: String) -> Unit = { _, _ -> },
) {
    var displayName by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var passwordVisible by remember { mutableStateOf(false) }
    var loading by remember { mutableStateOf(false) }
    var supportBusy by remember { mutableStateOf(false) }
    var knownAccount by remember { mutableStateOf<Boolean?>(null) }
    var trialBlocked by remember { mutableStateOf(false) }
    val error: MutableState<String?> = remember { mutableStateOf(null) }
    val scope = rememberCoroutineScope()
    val focusManager = LocalFocusManager.current
    val keyboard = LocalSoftwareKeyboardController.current
    val colors = MonitorTheme.colors
    val context = LocalContext.current
    val fingerprint = remember { InstallId.get(context) }
    val installId = fingerprint.id
    val installSignals = fingerprint.signals

    val failureMessage = stringResource(R.string.pair_failed)
    val limitMessage = stringResource(R.string.limit_reached)
    val invalidCode = stringResource(R.string.pair_invalid_code)
    val nameRequired = stringResource(R.string.pair_name_required)
    val badPassword = stringResource(R.string.pair_password_wrong)
    val passwordFormat = stringResource(R.string.pair_password_invalid)
    val trialEndedMessage = stringResource(R.string.pair_trial_ended_generic)
    val trialUsedMessage = stringResource(R.string.pair_trial_used_generic)
    val trialEndedWithPhone = stringResource(R.string.pair_trial_ended)
    val trialUsedWithPhone = stringResource(R.string.pair_trial_used)
    val callCenterTitle = stringResource(R.string.profile_call_center)
    val callCenterFailed = stringResource(R.string.profile_call_center_failed)
    val phoneDigits = phone.filter { it.isDigit() }
    val pinOk = password.length >= 4 && password.all { it.isDigit() }
    val returningUser = knownAccount == true
    val busy = loading || supportBusy
    val canSubmit = !busy &&
        phoneDigits.length >= 9 &&
        pinOk &&
        (returningUser || (displayName.isNotBlank() && !trialBlocked))
    val canOpenSupport = !busy && phoneDigits.length >= 9 && pinOk

    LaunchedEffect(phoneDigits, installId, installSignals) {
        if (phoneDigits.length < 9) {
            knownAccount = null
            trialBlocked = false
            return@LaunchedEffect
        }
        delay(350)
        val status = runCatching {
            apiClient.pairStatus(phone.trim(), installId, installSignals)
        }.getOrNull()
        knownAccount = status?.exists
        if (status?.exists == true) {
            code = ""
            trialBlocked = false
            if (error.value != null &&
                (error.value == trialUsedMessage ||
                    error.value == trialEndedMessage ||
                    error.value?.contains(trialUsedWithPhone.take(20)) == true)
            ) {
                error.value = null
            }
            return@LaunchedEffect
        }
        val blocked = status != null && status.trialBlocked && !status.exists
        trialBlocked = blocked
        if (blocked && status != null) {
            val existing = status.existingPhone?.filter { it.isDigit() }.orEmpty()
            if (existing.length >= 9 && existing != phoneDigits) {
                // Switch to the account that already owns this phone's demo.
                phone = existing
                displayName = ""
                code = ""
                return@LaunchedEffect
            }
            // Never show names like "Call Center" — login is always the phone number.
            val label = existing.takeIf { it.length >= 9 }
                ?: status.existingPhone?.filter { it.isDigit() }?.takeIf { it.length >= 9 }
            error.value = when {
                status.trialEnded && !label.isNullOrBlank() ->
                    trialEndedWithPhone.format(label)
                status.trialEnded -> trialEndedMessage
                !label.isNullOrBlank() -> trialUsedWithPhone.format(label)
                else -> trialUsedMessage
            }
        }
    }

    fun submit() {
        if (!canSubmit) return
        keyboard?.hide()
        focusManager.clearFocus()
        loading = true
        error.value = null
        scope.launch {
            runCatching {
                apiClient.pair(
                    PairRequest(
                        code = if (returningUser) {
                            ""
                        } else {
                            code.replace("MONITOR:", "", ignoreCase = true).trim()
                        },
                        name = if (returningUser) "" else displayName.trim(),
                        phone = phone.trim().ifBlank { null },
                        password = password,
                        appVersion = BuildConfig.VERSION_NAME,
                        androidVersion = Build.VERSION.RELEASE,
                        deviceModel = "${Build.MANUFACTURER} ${Build.MODEL}",
                        installId = installId,
                        installSignals = installSignals,
                    ),
                )
            }.onSuccess {
                loading = false
                onPaired()
            }.onFailure { err ->
                loading = false
                val api = err.apiErrorMessage()
                error.value = when {
                    api.contains("Trial ended", ignoreCase = true) -> {
                        val phoneHint = Regex("""Sign in as\s+(\+?\d{9,})""")
                            .find(api)?.groupValues?.getOrNull(1)
                        if (!phoneHint.isNullOrBlank()) {
                            phone = phoneHint.filter { it.isDigit() }
                            trialEndedWithPhone.format(phoneHint)
                        } else {
                            trialEndedMessage
                        }
                    }
                    api.contains("Free trial already used", ignoreCase = true) -> {
                        val phoneHint = Regex("""Sign in as\s+(\+?\d{9,})""")
                            .find(api)?.groupValues?.getOrNull(1)
                        if (!phoneHint.isNullOrBlank()) {
                            phone = phoneHint.filter { it.isDigit() }
                            trialUsedWithPhone.format(phoneHint)
                        } else {
                            trialUsedMessage
                        }
                    }
                    api.contains("Device id required", ignoreCase = true) -> trialEndedMessage
                    api.contains("limit", ignoreCase = true) -> limitMessage
                    api.contains("Invalid pairing", ignoreCase = true) -> invalidCode
                    api.contains("Name is required", ignoreCase = true) -> nameRequired
                    api.contains("Invalid password", ignoreCase = true) -> badPassword
                    api.contains("at least 4 digits", ignoreCase = true) -> passwordFormat
                    api.contains("Subscription", ignoreCase = true) -> api
                    else -> failureMessage
                }
            }
        }
    }

    fun openCallCenter() {
        keyboard?.hide()
        focusManager.clearFocus()
        supportBusy = true
        error.value = null
        scope.launch {
            runCatching {
                if (canOpenSupport) {
                    apiClient.pair(
                        PairRequest(
                            code = if (returningUser) {
                                ""
                            } else {
                                code.replace("MONITOR:", "", ignoreCase = true).trim()
                            },
                            name = if (returningUser) "" else displayName.trim(),
                            phone = phone.trim().ifBlank { null },
                            password = password,
                            appVersion = BuildConfig.VERSION_NAME,
                            androidVersion = Build.VERSION.RELEASE,
                            deviceModel = "${Build.MANUFACTURER} ${Build.MODEL}",
                            installId = installId,
                            installSignals = installSignals,
                        ),
                    )
                } else {
                    apiClient.guestSupport(
                        GuestSupportRequest(
                            name = displayName.trim().ifBlank { "Guest" },
                            appVersion = BuildConfig.VERSION_NAME,
                            androidVersion = Build.VERSION.RELEASE,
                            deviceModel = "${Build.MANUFACTURER} ${Build.MODEL}",
                            installId = installId,
                            installSignals = installSignals,
                        ),
                    )
                }
                apiClient.openSupportChat()
            }.onSuccess { thread ->
                supportBusy = false
                onOpenSupport(thread.id, callCenterTitle)
            }.onFailure { err ->
                supportBusy = false
                val api = err.apiErrorMessage()
                val msg = when {
                    api.contains("Invalid password", ignoreCase = true) -> badPassword
                    api.contains("Name is required", ignoreCase = true) -> nameRequired
                    else -> DeviceApiClient.errorMessage(err, callCenterFailed)
                }
                error.value = msg
                Toast.makeText(context, msg, Toast.LENGTH_LONG).show()
            }
        }
    }

    ScreenContainer {
        Spacer(modifier = Modifier.size(Spacing.md))

        Text(
            text = stringResource(R.string.pair_title),
            style = MaterialTheme.typography.headlineLarge,
            color = colors.textPrimary,
        )
        Spacer(modifier = Modifier.size(Spacing.xs))
        Text(
            text = stringResource(R.string.pair_subtitle),
            style = MaterialTheme.typography.bodyMedium,
            color = colors.textMuted,
        )

        Spacer(modifier = Modifier.size(Spacing.xl))

        AnimatedVisibility(
            visible = error.value != null,
            enter = fadeIn(tween(200)) + expandVertically(tween(200)) +
                slideInVertically(tween(200)) { -it / 3 },
            exit = fadeOut(tween(150)) + shrinkVertically(tween(150)),
        ) {
            Column {
                ErrorBanner(
                    title = stringResource(R.string.pair_error_title),
                    message = error.value.orEmpty(),
                )
                Spacer(modifier = Modifier.size(Spacing.md))
            }
        }

        MonitorCard {
            SectionHeader(
                title = stringResource(R.string.pair_section_title),
                icon = Icons.Rounded.Link,
            )
            Spacer(modifier = Modifier.size(Spacing.md))

            MonitorTextField(
                value = phone,
                onValueChange = {
                    phone = it.filter { ch -> ch.isDigit() || ch == '+' || ch == ' ' }.take(16)
                    if (error.value != null) error.value = null
                },
                label = stringResource(R.string.pair_phone_label),
                placeholder = stringResource(R.string.pair_phone_placeholder),
                helperText = stringResource(R.string.pair_phone_helper),
                enabled = !busy,
                leadingIcon = Icons.Rounded.Phone,
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Phone,
                    imeAction = ImeAction.Next,
                ),
                keyboardActions = KeyboardActions(
                    onNext = { focusManager.moveFocus(FocusDirection.Down) },
                ),
            )

            Spacer(modifier = Modifier.size(Spacing.md))

            MonitorTextField(
                value = password,
                onValueChange = {
                    password = it.filter { ch -> ch.isDigit() }.take(12)
                    if (error.value != null) error.value = null
                },
                label = stringResource(R.string.pair_password_label),
                placeholder = stringResource(R.string.pair_password_placeholder),
                helperText = if (returningUser) {
                    stringResource(R.string.pair_password_returning_helper)
                } else {
                    stringResource(R.string.pair_password_helper)
                },
                enabled = !busy,
                leadingIcon = Icons.Rounded.Lock,
                trailingIcon = if (passwordVisible) {
                    Icons.Rounded.Visibility
                } else {
                    Icons.Rounded.VisibilityOff
                },
                trailingContentDescription = stringResource(
                    if (passwordVisible) R.string.pair_password_hide else R.string.pair_password_show,
                ),
                onTrailingClick = { passwordVisible = !passwordVisible },
                visualTransformation = if (passwordVisible) {
                    VisualTransformation.None
                } else {
                    PasswordVisualTransformation()
                },
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.NumberPassword,
                    imeAction = if (returningUser) ImeAction.Done else ImeAction.Next,
                ),
                keyboardActions = KeyboardActions(
                    onNext = { focusManager.moveFocus(FocusDirection.Down) },
                    onDone = { submit() },
                ),
            )

            AnimatedVisibility(
                visible = !returningUser,
                enter = fadeIn(tween(180)) + expandVertically(tween(180)),
                exit = fadeOut(tween(120)) + shrinkVertically(tween(120)),
            ) {
                Column {
                    Spacer(modifier = Modifier.size(Spacing.md))
                    MonitorTextField(
                        value = displayName,
                        onValueChange = {
                            displayName = it.take(48)
                            if (error.value != null) error.value = null
                        },
                        label = stringResource(R.string.pair_name_label),
                        placeholder = stringResource(R.string.pair_name_placeholder),
                        helperText = stringResource(R.string.pair_name_helper),
                        enabled = !busy,
                        leadingIcon = Icons.Rounded.Person,
                        keyboardOptions = KeyboardOptions(
                            capitalization = KeyboardCapitalization.Words,
                            imeAction = ImeAction.Next,
                        ),
                        keyboardActions = KeyboardActions(
                            onNext = { focusManager.moveFocus(FocusDirection.Down) },
                        ),
                    )
                }
            }

            AnimatedVisibility(
                visible = !returningUser,
                enter = fadeIn(tween(180)) + expandVertically(tween(180)),
                exit = fadeOut(tween(120)) + shrinkVertically(tween(120)),
            ) {
                Column {
                    Spacer(modifier = Modifier.size(Spacing.md))
                    MonitorTextField(
                        value = code,
                        onValueChange = {
                            code = it.uppercase().replace(" ", "").take(24)
                            if (error.value != null) error.value = null
                        },
                        label = stringResource(R.string.pair_code_label),
                        placeholder = stringResource(R.string.pair_code_placeholder),
                        helperText = stringResource(R.string.pair_code_helper),
                        enabled = !busy,
                        leadingIcon = Icons.Rounded.VpnKey,
                        keyboardOptions = KeyboardOptions(
                            capitalization = KeyboardCapitalization.Characters,
                            imeAction = ImeAction.Done,
                        ),
                        keyboardActions = KeyboardActions(onDone = { submit() }),
                    )
                }
            }
        }

        Spacer(modifier = Modifier.size(Spacing.lg))

        PrimaryButton(
            text = stringResource(R.string.pair_button),
            onClick = { submit() },
            enabled = canSubmit,
            loading = loading,
        )

        Spacer(modifier = Modifier.size(Spacing.sm))

        PrimaryButton(
            text = stringResource(R.string.profile_call_center),
            onClick = { openCallCenter() },
            enabled = !busy,
            loading = supportBusy,
            icon = Icons.Rounded.HeadsetMic,
        )

        Spacer(modifier = Modifier.size(Spacing.lg))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(Spacing.xs),
            verticalAlignment = Alignment.Top,
        ) {
            Icon(
                imageVector = Icons.Rounded.Shield,
                contentDescription = null,
                tint = colors.textMuted,
                modifier = Modifier
                    .padding(top = 2.dp)
                    .size(Sizing.iconSm),
            )
            Text(
                text = stringResource(R.string.pair_footer_hint),
                style = MaterialTheme.typography.bodySmall,
                color = colors.textMuted,
            )
        }

        Spacer(
            modifier = Modifier
                .size(Spacing.xxl)
                .navigationBarsPadding(),
        )
    }
}

private fun Throwable.apiErrorMessage(): String =
    DeviceApiClient.errorMessage(this, message.orEmpty())
