package com.monitor.device.ui.screens

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import com.monitor.device.Emulator
import com.monitor.device.core.auth.TokenStore
import com.monitor.device.monitoring.service.MonitoringForegroundService
import kotlinx.coroutines.delay

@Composable
fun rememberMonitoringSession(
    tokenStore: TokenStore,
    onUnpaired: () -> Unit,
): MonitoringSession {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    var monitoring by remember { mutableStateOf(MonitoringForegroundService.isStarted()) }

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event != Lifecycle.Event.ON_RESUME) return@LifecycleEventObserver
            when {
                !tokenStore.isPaired() -> onUnpaired()
                tokenStore.isAutoStartEnabled() &&
                    hasCapturePermissions(context) &&
                    !Emulator.isEmulator &&
                    !MonitoringForegroundService.isChatCameraHold() -> {
                    MonitoringForegroundService.start(context)
                    monitoring = MonitoringForegroundService.isStarted()
                }
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    LaunchedEffect(Unit) {
        while (true) {
            if (!tokenStore.isPaired()) break
            val live = MonitoringForegroundService.isStarted()
            monitoring = live
            val inForeground = lifecycleOwner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)
            if (
                !live &&
                inForeground &&
                tokenStore.isAutoStartEnabled() &&
                !Emulator.isEmulator &&
                !MonitoringForegroundService.isChatCameraHold() &&
                hasCapturePermissions(context)
            ) {
                MonitoringForegroundService.start(context)
            }
            delay(1_000)
        }
    }

    return MonitoringSession(
        active = monitoring,
        start = {
            tokenStore.setAutoStartEnabled(true)
            MonitoringForegroundService.start(context)
            monitoring = true
        },
        stop = {
            MonitoringForegroundService.stop(context)
            tokenStore.setAutoStartEnabled(false)
            monitoring = false
        },
    )
}

data class MonitoringSession(
    val active: Boolean,
    val start: () -> Unit,
    val stop: () -> Unit,
)
