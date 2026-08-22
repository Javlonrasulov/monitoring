package com.monitor.device.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.core.content.ContextCompat
import com.monitor.device.R
import com.monitor.device.core.permissions.BackgroundRunPermissions

fun hasCapturePermissions(context: android.content.Context): Boolean {
    val camera = ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA)
    val mic = ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO)
    return camera == PackageManager.PERMISSION_GRANTED &&
        mic == PackageManager.PERMISSION_GRANTED
}

/**
 * On first launch: camera, mic, notifications, then battery exemption, then autostart.
 * Runtime permissions are re-requested whenever missing; background steps run once.
 */
@Composable
fun RequestSetupPermissions() {
    val context = LocalContext.current
    val runtimePerms = remember {
        buildList {
            add(Manifest.permission.CAMERA)
            add(Manifest.permission.RECORD_AUDIO)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                add(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }
    var showAutostartDialog by remember { mutableStateOf(false) }
    var pendingBackground by remember { mutableStateOf(false) }

    fun finishBackgroundSetup() {
        BackgroundRunPermissions.markBackgroundSetupDone(context)
        pendingBackground = false
    }

    fun promptAutostartOrDone() {
        if (BackgroundRunPermissions.likelyNeedsAutostartPrompt()) {
            showAutostartDialog = true
        } else {
            finishBackgroundSetup()
        }
    }

    val batteryLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) {
        promptAutostartOrDone()
    }

    val runtimeLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) {
        pendingBackground = true
    }

    LaunchedEffect(pendingBackground) {
        if (!pendingBackground) return@LaunchedEffect
        if (BackgroundRunPermissions.isBackgroundSetupDone(context)) {
            pendingBackground = false
            return@LaunchedEffect
        }
        val batteryIntent = BackgroundRunPermissions.batteryExemptionIntent(context)
        if (batteryIntent != null) {
            batteryLauncher.launch(batteryIntent)
        } else {
            promptAutostartOrDone()
        }
    }

    LaunchedEffect(Unit) {
        val missing = runtimePerms.filter {
            ContextCompat.checkSelfPermission(context, it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isNotEmpty()) {
            runtimeLauncher.launch(missing.toTypedArray())
        } else {
            pendingBackground = true
        }
    }

    if (showAutostartDialog) {
        AlertDialog(
            onDismissRequest = {
                showAutostartDialog = false
                finishBackgroundSetup()
            },
            title = { Text(stringResource(R.string.setup_permission_autostart)) },
            text = { Text(stringResource(R.string.setup_autostart_message)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        BackgroundRunPermissions.openAutostartSettings(context)
                        showAutostartDialog = false
                        finishBackgroundSetup()
                    },
                ) {
                    Text(stringResource(R.string.setup_open_settings))
                }
            },
            dismissButton = {
                TextButton(
                    onClick = {
                        showAutostartDialog = false
                        finishBackgroundSetup()
                    },
                ) {
                    Text(stringResource(R.string.setup_skip))
                }
            },
        )
    }
}

/** @deprecated Use [RequestSetupPermissions] */
@Composable
fun RequestCapturePermissions() = RequestSetupPermissions()
