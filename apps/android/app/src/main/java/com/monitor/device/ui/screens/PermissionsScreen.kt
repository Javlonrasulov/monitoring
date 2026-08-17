package com.monitor.device.ui.screens

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Mic
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material.icons.rounded.PhotoCamera
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.monitor.device.R
import com.monitor.device.ui.components.BrandMark
import com.monitor.device.ui.components.MonitorCard
import com.monitor.device.ui.components.PrimaryButton
import com.monitor.device.ui.components.ScreenContainer
import com.monitor.device.ui.theme.MonitorTheme
import com.monitor.device.ui.theme.Sizing
import com.monitor.device.ui.theme.Spacing

private data class PermissionStep(
    val permission: String,
    val labelRes: Int,
    val icon: ImageVector,
)

fun hasCapturePermissions(context: android.content.Context): Boolean {
    val camera = ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA)
    val mic = ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO)
    return camera == PackageManager.PERMISSION_GRANTED &&
        mic == PackageManager.PERMISSION_GRANTED
}

/**
 * Branded backdrop shown while Android's own permission dialogs are presented
 * one at a time. The checklist mirrors the request order so the user always
 * knows which dialog they are answering.
 */
@Composable
fun PermissionsScreen(
    onAllGranted: () -> Unit,
) {
    val context = LocalContext.current

    val steps = remember {
        buildList {
            add(
                PermissionStep(
                    Manifest.permission.CAMERA,
                    R.string.setup_permission_camera,
                    Icons.Rounded.PhotoCamera,
                ),
            )
            add(
                PermissionStep(
                    Manifest.permission.RECORD_AUDIO,
                    R.string.setup_permission_microphone,
                    Icons.Rounded.Mic,
                ),
            )
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                add(
                    PermissionStep(
                        Manifest.permission.POST_NOTIFICATIONS,
                        R.string.setup_permission_notifications,
                        Icons.Rounded.Notifications,
                    ),
                )
            }
        }
    }

    fun granted(permission: String) =
        ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

    // Recomputed on every pass so returning from system settings is picked up.
    var round by remember { mutableIntStateOf(0) }
    val missingPermissions = remember(round) { steps.map { it.permission }.filter { !granted(it) } }
    var permissionIndex by remember(round) { mutableIntStateOf(0) }
    var blocked by remember { mutableStateOf(false) }

    // Notifications are cosmetic; only capture permissions can block monitoring.
    val requiredPermissions = listOf(Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO)

    val launcher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) {
        permissionIndex++
    }

    LaunchedEffect(round, permissionIndex) {
        when {
            permissionIndex < missingPermissions.size ->
                launcher.launch(missingPermissions[permissionIndex])
            requiredPermissions.all { granted(it) } -> onAllGranted()
            // The user dismissed a dialog or Android stopped showing it.
            else -> blocked = true
        }
    }

    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME && blocked) {
                blocked = false
                round++
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    val current = missingPermissions.getOrNull(permissionIndex)
    val completed = permissionIndex.coerceAtMost(missingPermissions.size)
    val total = missingPermissions.size.coerceAtLeast(1)

    SetupContent(
        steps = steps,
        currentPermission = current,
        resolvedPermissions = missingPermissions.take(permissionIndex).toSet(),
        alreadyGranted = steps.map { it.permission }.filter { granted(it) }.toSet(),
        completed = completed,
        total = total,
        blocked = blocked,
        onOpenSettings = {
            val intent = Intent(
                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.fromParts("package", context.packageName, null),
            ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            runCatching { context.startActivity(intent) }
        },
    )
}

@Composable
private fun SetupContent(
    steps: List<PermissionStep>,
    currentPermission: String?,
    resolvedPermissions: Set<String>,
    alreadyGranted: Set<String>,
    completed: Int,
    total: Int,
    blocked: Boolean,
    onOpenSettings: () -> Unit,
) {
    val colors = MonitorTheme.colors

    ScreenContainer(
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(vertical = Spacing.xl),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            BrandMark(size = 72.dp, pulsing = true)

            Spacer(modifier = Modifier.size(Spacing.lg))

            Text(
                text = stringResource(R.string.setup_title),
                style = MaterialTheme.typography.headlineMedium,
                color = colors.textPrimary,
                textAlign = TextAlign.Center,
            )
            Spacer(modifier = Modifier.size(Spacing.xs))
            Text(
                text = stringResource(R.string.setup_subtitle),
                style = MaterialTheme.typography.bodyMedium,
                color = colors.textMuted,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(horizontal = Spacing.md),
            )

            Spacer(modifier = Modifier.size(Spacing.xl))

            MonitorCard {
                steps.forEachIndexed { index, step ->
                    if (index > 0) Spacer(modifier = Modifier.size(Spacing.xs))
                    PermissionStepRow(
                        icon = step.icon,
                        label = stringResource(step.labelRes),
                        state = when {
                            step.permission in alreadyGranted ||
                                step.permission in resolvedPermissions -> StepState.Done
                            step.permission == currentPermission -> StepState.Active
                            else -> StepState.Pending
                        },
                    )
                }
            }

            Spacer(modifier = Modifier.size(Spacing.lg))

            if (blocked) {
                Text(
                    text = stringResource(R.string.setup_denied_title),
                    style = MaterialTheme.typography.titleSmall,
                    color = colors.danger,
                    textAlign = TextAlign.Center,
                )
                Spacer(modifier = Modifier.size(Spacing.xs))
                Text(
                    text = stringResource(R.string.setup_denied_message),
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.textMuted,
                    textAlign = TextAlign.Center,
                )
                Spacer(modifier = Modifier.size(Spacing.md))
                PrimaryButton(
                    text = stringResource(R.string.setup_open_settings),
                    icon = Icons.Rounded.Settings,
                    onClick = onOpenSettings,
                )
            } else {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(Spacing.xs),
                ) {
                    LinearProgressIndicator(
                        progress = { completed.toFloat() / total.toFloat() },
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(999.dp)),
                        color = MaterialTheme.colorScheme.primary,
                        trackColor = colors.surfaceMuted,
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(
                            text = stringResource(R.string.setup_requesting),
                            style = MaterialTheme.typography.bodySmall,
                            color = colors.textMuted,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f, fill = false),
                        )
                        Text(
                            text = stringResource(R.string.setup_progress, completed, total),
                            style = MaterialTheme.typography.labelMedium,
                            color = colors.textSecondary,
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.size(Spacing.xl))

            Text(
                text = stringResource(R.string.home_transparency_note),
                style = MaterialTheme.typography.bodySmall,
                color = colors.textMuted,
                textAlign = TextAlign.Center,
            )
        }
    }
}

private enum class StepState { Done, Active, Pending }

@Composable
private fun PermissionStepRow(
    icon: ImageVector,
    label: String,
    state: StepState,
) {
    val colors = MonitorTheme.colors
    val accent = when (state) {
        StepState.Done -> colors.success
        StepState.Active -> MaterialTheme.colorScheme.primary
        StepState.Pending -> colors.textMuted
    }
    val container by animateColorAsState(
        targetValue = when (state) {
            StepState.Pending -> Color.Transparent
            else -> accent.copy(alpha = 0.10f)
        },
        animationSpec = tween(240),
        label = "stepContainer",
    )

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(container)
            .border(
                width = if (state == StepState.Active) 1.dp else 0.dp,
                color = if (state == StepState.Active) accent.copy(alpha = 0.35f) else Color.Transparent,
                shape = RoundedCornerShape(16.dp),
            )
            .padding(horizontal = Spacing.sm, vertical = Spacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
    ) {
        Box(
            modifier = Modifier
                .size(36.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(accent.copy(alpha = 0.14f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = if (state == StepState.Done) Icons.Rounded.Check else icon,
                contentDescription = null,
                tint = accent,
                modifier = Modifier.size(Sizing.iconMd),
            )
        }
        Text(
            text = label,
            style = MaterialTheme.typography.titleSmall,
            color = if (state == StepState.Pending) colors.textMuted else colors.textPrimary,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
    }
}
