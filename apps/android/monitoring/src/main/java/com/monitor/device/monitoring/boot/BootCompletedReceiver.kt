package com.monitor.device.monitoring.boot

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.monitor.device.core.auth.TokenStore
import com.monitor.device.monitoring.service.MonitoringForegroundService

/**
 * Restarts monitoring after reboot / unlock when the user left auto-start on.
 *
 * Samsung often blocks background camera starts — we retry for ~15 minutes and
 * show [BootRecoveryNotifier] so the user can resume with one tap.
 */
class BootCompletedReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        if (action !in HANDLED_ACTIONS) return

        if (action == Intent.ACTION_LOCKED_BOOT_COMPLETED) {
            Log.i(TAG, "Locked boot: defer until USER_UNLOCKED / BOOT_COMPLETED")
            return
        }

        val pending = goAsync()
        val app = context.applicationContext
        Thread {
            try {
                handleBoot(app, action)
            } finally {
                Handler(Looper.getMainLooper()).postDelayed({
                    pending.finish()
                }, CHECK_PUBLISHING_MS + 500L)
            }
        }.start()
    }

    private fun handleBoot(app: Context, action: String) {
        val store = runCatching {
            TokenStore(app).also { it.rehydrate() }
        }.getOrElse {
            Log.w(TAG, "TokenStore not ready ($action), scheduling retries", it)
            BootRestartScheduler.scheduleRetries(app)
            BootRecoveryNotifier.update(app)
            return
        }
        if (!store.isPaired()) {
            Log.i(TAG, "Boot: device not paired, skip ($action)")
            BootRecoveryNotifier.cancel(app)
            return
        }
        if (!store.isAutoStartEnabled()) {
            Log.i(TAG, "Boot: auto-start disabled ($action)")
            BootRecoveryNotifier.cancel(app)
            return
        }

        if (MonitoringForegroundService.isPublishing()) {
            Log.i(TAG, "Boot: already publishing, cancel retries ($action)")
            BootRestartScheduler.cancel(app)
            BootRecoveryNotifier.cancel(app)
            return
        }

        val userPresent = action == Intent.ACTION_USER_PRESENT
        Log.i(TAG, "Boot: attempting start ($action, userPresent=$userPresent)")

        if (userPresent) {
            launchTrampoline(app)
            MonitoringForegroundService.ensureStarted(app)
        } else {
            MonitoringForegroundService.ensureStarted(app)
            if (!MonitoringForegroundService.isPublishing()) {
                launchTrampoline(app)
            }
        }

        if (action != BootRestartScheduler.ACTION_RETRY) {
            BootRestartScheduler.scheduleRetries(app)
        }

        Thread.sleep(CHECK_PUBLISHING_MS)
        if (MonitoringForegroundService.isPublishing()) {
            Log.i(TAG, "Boot: publishing live ($action)")
            BootRestartScheduler.cancel(app)
            BootRecoveryNotifier.cancel(app)
        } else {
            Log.w(TAG, "Boot: not publishing yet, showing recovery notification ($action)")
            BootRecoveryNotifier.update(app)
            if (action == BootRestartScheduler.ACTION_RETRY) {
                BootRestartScheduler.scheduleRetries(app)
            }
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
        private const val CHECK_PUBLISHING_MS = 4_000L

        private val HANDLED_ACTIONS = setOf(
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_LOCKED_BOOT_COMPLETED,
            Intent.ACTION_USER_UNLOCKED,
            Intent.ACTION_USER_PRESENT,
            Intent.ACTION_MY_PACKAGE_REPLACED,
            BootRestartScheduler.ACTION_RETRY,
            "android.intent.action.QUICKBOOT_POWERON",
            "com.htc.intent.action.QUICKBOOT_POWERON",
        )
    }
}
