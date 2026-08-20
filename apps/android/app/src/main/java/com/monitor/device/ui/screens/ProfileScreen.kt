package com.monitor.device.ui.screens

import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CameraAlt
import androidx.compose.material.icons.rounded.HeadsetMic
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.Phone
import androidx.compose.material.icons.rounded.Smartphone
import androidx.compose.material.icons.rounded.WorkspacePremium
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.monitor.device.R
import com.monitor.device.core.api.DeviceApiClient
import com.monitor.device.core.auth.TokenStore
import com.monitor.device.core.model.DeviceMeResponse
import com.monitor.device.core.model.SubscriptionDto
import com.monitor.device.ui.chat.compressAvatar
import com.monitor.device.ui.components.InfoRow
import com.monitor.device.ui.components.MonitorCard
import com.monitor.device.ui.components.PrimaryButton
import com.monitor.device.ui.components.ScreenContainer
import com.monitor.device.ui.components.SecondaryButton
import com.monitor.device.ui.components.SectionHeader
import com.monitor.device.ui.components.StatusBadge
import com.monitor.device.ui.components.UserAvatar
import com.monitor.device.ui.components.rememberAuthImageLoader
import com.monitor.device.ui.theme.MonitorTheme
import com.monitor.device.ui.theme.Spacing
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun ProfileScreen(
    apiClient: DeviceApiClient,
    tokenStore: TokenStore,
    onUnpair: () -> Unit,
    onOpenCallCenter: (threadId: String, title: String) -> Unit,
    isActive: Boolean = true,
    onSupportUnreadChange: (Int) -> Unit = {},
) {
    val colors = MonitorTheme.colors
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val imageLoader = rememberAuthImageLoader(apiClient)
    var sub by remember { mutableStateOf<SubscriptionDto?>(null) }
    var userId by remember { mutableStateOf(tokenStore.userId()) }
    var hasAvatar by remember { mutableStateOf(false) }
    var avatarUpdatedAt by remember { mutableStateOf<String?>(null) }
    var displayName by remember { mutableStateOf(tokenStore.deviceName().orEmpty()) }
    var phone by remember { mutableStateOf("") }
    var editing by remember { mutableStateOf<String?>(null) }
    var draft by remember { mutableStateOf("") }
    var currentPassword by remember { mutableStateOf("") }
    var newPassword by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    var callCenterBusy by remember { mutableStateOf(false) }
    var supportUnread by remember { mutableIntStateOf(0) }

    fun applyMe(me: DeviceMeResponse) {
        userId = me.userId ?: tokenStore.userId()
        hasAvatar = me.hasAvatar
        avatarUpdatedAt = me.avatarUpdatedAt
        val name = me.name
        if (!name.isNullOrBlank()) displayName = name
        phone = me.phone.orEmpty()
    }

    suspend fun refreshSupportUnread() {
        runCatching { apiClient.supportSummary() }
            .onSuccess { supportUnread = it.unreadCount }
    }

    LaunchedEffect(Unit) {
        runCatching { apiClient.subscription() }.onSuccess { sub = it }
        runCatching { apiClient.me() }.onSuccess(::applyMe)
        refreshSupportUnread()
    }

    LaunchedEffect(isActive) {
        if (isActive) refreshSupportUnread()
    }

    LaunchedEffect(supportUnread) {
        onSupportUnreadChange(supportUnread)
    }

    val picker = rememberLauncherForActivityResult(
        ActivityResultContracts.GetContent(),
    ) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            runCatching {
                val file = withContext(Dispatchers.IO) { compressAvatar(context, uri) }
                apiClient.uploadAvatar(file)
            }.onSuccess(::applyMe).onFailure {
                Toast.makeText(
                    context,
                    DeviceApiClient.errorMessage(it, context.getString(R.string.profile_photo_failed)),
                    Toast.LENGTH_LONG,
                ).show()
            }
        }
    }

    fun openPhotoPicker() {
        picker.launch("image/*")
    }

    val active = sub?.active == true
    val name = displayName.ifBlank { stringResource(R.string.home_device_fallback) }
    ScreenContainer {
        Spacer(modifier = Modifier.size(Spacing.md))
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Box(
                modifier = Modifier.combinedClickable(
                    onClick = { openPhotoPicker() },
                    onLongClick = {
                        if (!hasAvatar) return@combinedClickable
                        scope.launch {
                            runCatching { apiClient.deleteAvatar() }.onSuccess(::applyMe)
                        }
                    },
                ),
            ) {
                UserAvatar(
                    name = name,
                    imageUrl = if (hasAvatar) apiClient.avatarUrl(userId, avatarUpdatedAt) else null,
                    imageLoader = imageLoader,
                    size = 108.dp,
                )
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .size(34.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.primary),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        Icons.Rounded.CameraAlt,
                        contentDescription = stringResource(R.string.profile_change_photo),
                        tint = androidx.compose.ui.graphics.Color.White,
                        modifier = Modifier.size(18.dp),
                    )
                }
            }
            Spacer(modifier = Modifier.size(Spacing.sm))
            Text(
                text = name,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
                color = colors.textPrimary,
            )
            if (phone.isNotBlank()) {
                Text(
                    text = phone,
                    style = MaterialTheme.typography.bodyMedium,
                    color = colors.textMuted,
                )
            }
            Text(
                text = stringResource(
                    if (hasAvatar) R.string.profile_change_photo else R.string.profile_set_photo,
                ),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.clickable { openPhotoPicker() },
            )
        }

        Spacer(modifier = Modifier.size(Spacing.md))
        MonitorCard {
            InfoRow(
                stringResource(R.string.profile_name),
                name,
                icon = Icons.Rounded.Person,
                modifier = Modifier.clickable {
                    draft = displayName
                    editing = "name"
                },
            )
            InfoRow(
                stringResource(R.string.profile_phone),
                phone.ifBlank { stringResource(R.string.profile_phone_missing) },
                icon = Icons.Rounded.Phone,
                modifier = Modifier.clickable {
                    draft = phone
                    editing = "phone"
                },
            )
            InfoRow(
                stringResource(R.string.profile_change_password),
                stringResource(R.string.profile_edit),
                icon = Icons.Rounded.Lock,
                modifier = Modifier.clickable {
                    currentPassword = ""
                    newPassword = ""
                    confirmPassword = ""
                    editing = "password"
                },
            )
        }

        Spacer(modifier = Modifier.size(Spacing.md))
        BadgedBox(
            badge = {
                if (supportUnread > 0) {
                    Badge {
                        Text(
                            if (supportUnread > 99) "99+" else supportUnread.toString(),
                        )
                    }
                }
            },
        ) {
            PrimaryButton(
                text = stringResource(R.string.profile_call_center),
                onClick = {
                    if (callCenterBusy) return@PrimaryButton
                    callCenterBusy = true
                    scope.launch {
                        runCatching { apiClient.openSupportChat() }
                            .onSuccess { thread ->
                                callCenterBusy = false
                                supportUnread = 0
                                onOpenCallCenter(
                                    thread.id,
                                    context.getString(R.string.profile_call_center),
                                )
                            }
                            .onFailure {
                                callCenterBusy = false
                                Toast.makeText(
                                    context,
                                    DeviceApiClient.errorMessage(
                                        it,
                                        context.getString(R.string.profile_call_center_failed),
                                    ),
                                    Toast.LENGTH_LONG,
                                ).show()
                            }
                    }
                },
                enabled = !callCenterBusy,
                loading = callCenterBusy,
                icon = Icons.Rounded.HeadsetMic,
            )
        }

        Spacer(modifier = Modifier.size(Spacing.lg))
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
                formatSubscriptionExpiry(sub?.expiresAt),
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

    val field = editing
    if (field == "password") {
        AlertDialog(
            onDismissRequest = { editing = null },
            title = { Text(stringResource(R.string.profile_change_password)) },
            text = {
                Column {
                    OutlinedTextField(
                        value = currentPassword,
                        onValueChange = { currentPassword = it },
                        label = { Text(stringResource(R.string.profile_current_password)) },
                        singleLine = true,
                        visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                    )
                    Spacer(modifier = Modifier.size(Spacing.sm))
                    OutlinedTextField(
                        value = newPassword,
                        onValueChange = { newPassword = it },
                        label = { Text(stringResource(R.string.profile_new_password)) },
                        singleLine = true,
                        visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                    )
                    Spacer(modifier = Modifier.size(Spacing.sm))
                    OutlinedTextField(
                        value = confirmPassword,
                        onValueChange = { confirmPassword = it },
                        label = { Text(stringResource(R.string.profile_confirm_password)) },
                        singleLine = true,
                        visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                    )
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        if (newPassword != confirmPassword) {
                            Toast.makeText(
                                context,
                                context.getString(R.string.profile_password_mismatch),
                                Toast.LENGTH_SHORT,
                            ).show()
                            return@TextButton
                        }
                        scope.launch {
                            runCatching {
                                apiClient.changePassword(currentPassword, newPassword)
                            }.onSuccess {
                                editing = null
                                Toast.makeText(
                                    context,
                                    context.getString(R.string.profile_password_changed),
                                    Toast.LENGTH_SHORT,
                                ).show()
                            }.onFailure {
                                Toast.makeText(
                                    context,
                                    DeviceApiClient.errorMessage(
                                        it,
                                        context.getString(R.string.profile_password_failed),
                                    ),
                                    Toast.LENGTH_LONG,
                                ).show()
                            }
                        }
                    },
                ) { Text(stringResource(R.string.profile_save)) }
            },
            dismissButton = {
                TextButton(onClick = { editing = null }) {
                    Text(stringResource(R.string.common_cancel))
                }
            },
        )
    } else if (field != null) {
        AlertDialog(
            onDismissRequest = { editing = null },
            title = {
                Text(
                    stringResource(
                        if (field == "name") R.string.profile_name else R.string.profile_phone,
                    ),
                )
            },
            text = {
                OutlinedTextField(
                    value = draft,
                    onValueChange = { draft = it },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(
                        keyboardType = if (field == "phone") KeyboardType.Phone else KeyboardType.Text,
                    ),
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        val value = draft.trim()
                        scope.launch {
                            runCatching {
                                if (field == "name") apiClient.updateProfile(name = value)
                                else apiClient.updateProfile(phone = value)
                            }.onSuccess { me ->
                                applyMe(me)
                                editing = null
                            }.onFailure {
                                Toast.makeText(
                                    context,
                                    context.getString(R.string.profile_update_failed),
                                    Toast.LENGTH_SHORT,
                                ).show()
                            }
                        }
                    },
                ) { Text(stringResource(R.string.profile_save)) }
            },
            dismissButton = {
                TextButton(onClick = { editing = null }) {
                    Text(stringResource(R.string.common_cancel))
                }
            },
        )
    }
}
