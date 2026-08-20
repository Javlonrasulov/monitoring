package com.monitor.device.monitoring.boot

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.monitor.device.core.auth.TokenStore
import com.monitor.device.monitoring.service.MonitoringForegroundService

/**
 * Restarts monitoring after reboot / unlock when the user left auto-start on.
 *
 * Android 12–14 may refuse a camera/mic foreground service from the background;
 * we retry a few times. Opening the app always works via
 * [com.monitor.device.ui.screens.rememberMonitoringSession].
 */
class BootCompletedReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        if (action !in HANDLED_ACTIONS) return

        // Credential-encrypted storage and camera FGS are unavailable before unlock.
        if (action == Intent.ACTION_LOCKED_BOOT_COMPLETED) {
            Log.i(TAG, "Locked boot: defer until USER_UNLOCKED / BOOT_COMPLETED")
            return
        }

        val app = context.applicationContext
        val store = runCatching { TokenStore(app) }.getOrElse {
            Log.w(TAG, "TokenStore not ready ($action), scheduling retries", it)
            BootRestartScheduler.scheduleRetries(app)
            return
        }
        if (!store.isPaired()) {
            Log.i(TAG, "Boot: device not paired, skip ($action)")
            return
        }
        if (!store.isAutoStartEnabled()) {
            Log.i(TAG, "Boot: auto-start disabled ($action)")
            return
        }

        if (MonitoringForegroundService.isStarted()) {
            BootRestartScheduler.cancel(app)
            return
        }

        Log.i(TAG, "Boot: trying monitoring start ($action)")
        MonitoringForegroundService.start(app)

        if (action != BootRestartScheduler.ACTION_RETRY) {
            BootRestartScheduler.scheduleRetries(app)
        } else if (MonitoringForegroundService.isStarted()) {
            BootRestartScheduler.cancel(app)
        }
    }

    companion object {
        private const val TAG = "BootCompletedReceiver"

        private val HANDLED_ACTIONS = setOf(
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_LOCKED_BOOT_COMPLETED,
            Intent.ACTION_USER_UNLOCKED,
            Intent.ACTION_MY_PACKAGE_REPLACED,
            BootRestartScheduler.ACTION_RETRY,
            "android.intent.action.QUICKBOOT_POWERON",
            "com.htc.intent.action.QUICKBOOT_POWERON",
        )
    }
}
