package com.monitor.device.monitoring.boot

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.monitor.device.core.auth.TokenStore
import com.monitor.device.monitoring.service.MonitoringForegroundService

/**
 * Respects Android limits: only auto-starts if previously paired and user had monitoring enabled.
 * Does not bypass OEM autostart restrictions — Admin Web will show OFFLINE if blocked.
 */
class BootCompletedReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action != Intent.ACTION_BOOT_COMPLETED &&
            intent?.action != Intent.ACTION_LOCKED_BOOT_COMPLETED
        ) {
            return
        }

        val store = TokenStore(context.applicationContext)
        if (!store.isPaired()) {
            Log.i(TAG, "Boot: device not paired, skip auto-start")
            return
        }
        if (!store.isAutoStartEnabled()) {
            Log.i(TAG, "Boot: auto-start disabled by user preference")
            return
        }

        Log.i(TAG, "Boot: starting monitoring foreground service")
        if (!MonitoringForegroundService.start(context.applicationContext)) {
            // Android 12+ may refuse a camera FGS started from boot; the user
            // resumes it by opening the app, Admin Web shows OFFLINE until then.
            Log.w(TAG, "Boot: system refused auto-start, waiting for app launch")
        }
    }

    companion object {
        private const val TAG = "BootCompletedReceiver"
    }
}
