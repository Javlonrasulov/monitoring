package com.monitor.device.ui.screens

import android.os.Build
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
import androidx.compose.material.icons.rounded.Link
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.Phone
import androidx.compose.material.icons.rounded.Shield
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
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.monitor.device.BuildConfig
import com.monitor.device.R
import com.monitor.device.core.api.DeviceApiClient
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
) {
    var displayName by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var knownAccount by remember { mutableStateOf<Boolean?>(null) }
    val error: MutableState<String?> = remember { mutableStateOf(null) }
    val scope = rememberCoroutineScope()
    val focusManager = LocalFocusManager.current
    val keyboard = LocalSoftwareKeyboardController.current
    val colors = MonitorTheme.colors

    val failureMessage = stringResource(R.string.pair_failed)
    val limitMessage = stringResource(R.string.limit_reached)
    val invalidCode = stringResource(R.string.pair_invalid_code)
    val nameRequired = stringResource(R.string.pair_name_required)
    val phoneDigits = phone.filter { it.isDigit() }
    val returningUser = knownAccount == true
    val canSubmit = !loading &&
        phoneDigits.length >= 9 &&
        (returningUser || displayName.isNotBlank())

    LaunchedEffect(phoneDigits) {
        if (phoneDigits.length < 9) {
            knownAccount = null
            return@LaunchedEffect
        }
        delay(350)
        knownAccount = runCatching {
            apiClient.pairStatus(phone.trim())
        }.getOrNull()?.exists
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
                        code = code.replace("MONITOR:", "", ignoreCase = true).trim(),
                        name = if (returningUser) "" else displayName.trim(),
                        phone = phone.trim().ifBlank { null },
                        appVersion = BuildConfig.VERSION_NAME,
                        androidVersion = Build.VERSION.RELEASE,
                        deviceModel = "${Build.MANUFACTURER} ${Build.MODEL}",
                    ),
                )
            }.onSuccess {
                loading = false
                onPaired()
            }.onFailure { err ->
                loading = false
                val api = err.apiErrorMessage()
                error.value = when {
                    api.contains("limit", ignoreCase = true) -> limitMessage
                    api.contains("Invalid pairing", ignoreCase = true) -> invalidCode
                    api.contains("Name is required", ignoreCase = true) -> nameRequired
                    api.contains("Subscription", ignoreCase = true) -> api
                    else -> failureMessage
                }
            }
        }
    }

    RequestCapturePermissions()

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
                enabled = !loading,
                leadingIcon = Icons.Rounded.Phone,
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Phone,
                    imeAction = ImeAction.Next,
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
                        enabled = !loading,
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
                enabled = !loading,
                leadingIcon = Icons.Rounded.VpnKey,
                keyboardOptions = KeyboardOptions(
                    capitalization = KeyboardCapitalization.Characters,
                    imeAction = ImeAction.Done,
                ),
                keyboardActions = KeyboardActions(onDone = { submit() }),
            )
        }

        Spacer(modifier = Modifier.size(Spacing.lg))

        PrimaryButton(
            text = stringResource(R.string.pair_button),
            onClick = { submit() },
            enabled = canSubmit,
            loading = loading,
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
