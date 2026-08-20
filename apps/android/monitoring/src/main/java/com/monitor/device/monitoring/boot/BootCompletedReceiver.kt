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
 * Android 12–14 often refuses camera/mic FGS from a plain background start.
 * We launch a transparent [BootTrampolineActivity] (while-in-use), then retry
 * for ~15 minutes until the publisher is actually streaming.
 */
class BootCompletedReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        if (action !in HANDLED_ACTIONS) return

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

        if (MonitoringForegroundService.isPublishing()) {
            Log.i(TAG, "Boot: already publishing, cancel retries ($action)")
            BootRestartScheduler.cancel(app)
            return
        }

        Log.i(TAG, "Boot: launching trampoline ($action)")
        val launched = launchTrampoline(app)
        if (!launched) {
            Log.w(TAG, "Boot: trampoline blocked, trying FGS directly")
            MonitoringForegroundService.ensureStarted(app)
        }

        if (action != BootRestartScheduler.ACTION_RETRY) {
            BootRestartScheduler.scheduleRetries(app)
        } else if (MonitoringForegroundService.isPublishing()) {
            BootRestartScheduler.cancel(app)
        }
    }

    private fun launchTrampoline(app: Context): Boolean {
        val intent = Intent(app, BootTrampolineActivity::class.java)
            .addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_NO_ANIMATION or
                    Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS,
            )
        return runCatching {
            app.startActivity(intent)
            true
        }.onFailure {
            Log.w(TAG, "Could not start boot trampoline", it)
        }.getOrDefault(false)
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
