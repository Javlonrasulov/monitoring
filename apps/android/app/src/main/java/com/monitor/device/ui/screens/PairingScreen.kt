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
import androidx.compose.material.icons.rounded.Badge
import androidx.compose.material.icons.rounded.Link
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
import kotlinx.coroutines.launch

@Composable
fun PairingScreen(
    apiClient: DeviceApiClient,
    onPaired: () -> Unit,
) {
    var code by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    val error: MutableState<String?> = remember { mutableStateOf(null) }
    val scope = rememberCoroutineScope()
    val focusManager = LocalFocusManager.current
    val keyboard = LocalSoftwareKeyboardController.current
    val colors = MonitorTheme.colors

    // Transport errors surface as raw strings like "HTTP 400 Bad Request";
    // show the localized guidance instead.
    val failureMessage = stringResource(R.string.pair_failed)
    val canSubmit = !loading && code.isNotBlank() && name.isNotBlank()

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
                        name = name.trim(),
                        appVersion = BuildConfig.VERSION_NAME,
                        androidVersion = Build.VERSION.RELEASE,
                        deviceModel = "${Build.MANUFACTURER} ${Build.MODEL}",
                    ),
                )
            }.onSuccess {
                loading = false
                onPaired()
            }.onFailure {
                loading = false
                error.value = failureMessage
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
                value = code,
                onValueChange = {
                    code = it.uppercase().take(12)
                    if (error.value != null) error.value = null
                },
                label = stringResource(R.string.pair_code_label),
                placeholder = stringResource(R.string.pair_code_placeholder),
                helperText = stringResource(R.string.pair_code_helper),
                enabled = !loading,
                leadingIcon = Icons.Rounded.VpnKey,
                keyboardOptions = KeyboardOptions(
                    capitalization = KeyboardCapitalization.Characters,
                    imeAction = ImeAction.Next,
                ),
                keyboardActions = KeyboardActions(
                    onNext = { focusManager.moveFocus(FocusDirection.Down) },
                ),
            )

            Spacer(modifier = Modifier.size(Spacing.md))

            MonitorTextField(
                value = name,
                onValueChange = {
                    name = it.take(64)
                    if (error.value != null) error.value = null
                },
                label = stringResource(R.string.pair_device_name_label),
                placeholder = stringResource(R.string.pair_device_name_placeholder),
                helperText = stringResource(R.string.pair_device_name_helper),
                enabled = !loading,
                leadingIcon = Icons.Rounded.Badge,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
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

        Spacer(modifier = Modifier.size(Spacing.sm))
        Text(
            text = stringResource(R.string.pair_qr_hint),
            style = MaterialTheme.typography.bodySmall,
            color = colors.textMuted,
        )

        Spacer(
            modifier = Modifier
                .size(Spacing.xxl)
                .navigationBarsPadding(),
        )
    }
}
