package com.monitor.device.monitoring.boot

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.SystemClock
import android.util.Log

/**
 * Schedules wakeups after reboot so monitoring can start once the
 * system is ready (CE storage unlocked, OEM "autostart" windows, etc.).
 */
object BootRestartScheduler {
    const val ACTION_RETRY = "com.monitor.device.action.BOOT_RETRY"
    private const val TAG = "BootRestartScheduler"
    private const val RETRY_COUNT = 30
    /** 30s, 60s, … 900s (~15 min of attempts after reboot). */
    private val RETRY_DELAYS_MS = LongArray(RETRY_COUNT) { index -> (index + 1) * 30_000L }

    fun scheduleRetries(context: Context) {
        val app = context.applicationContext
        val am = app.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        RETRY_DELAYS_MS.forEachIndexed { index, delayMs ->
            val pi = pendingIntent(app, requestCode = index + 1)
            val triggerAt = SystemClock.elapsedRealtime() + delayMs
            runCatching {
                am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pi)
            }.onFailure {
                Log.w(TAG, "Could not schedule boot retry #$index", it)
            }
        }
        Log.i(TAG, "Scheduled $RETRY_COUNT boot retries")
    }

    fun cancel(context: Context) {
        val app = context.applicationContext
        val am = app.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        RETRY_DELAYS_MS.indices.forEach { index ->
            am.cancel(pendingIntent(app, requestCode = index + 1))
        }
    }

    private fun pendingIntent(context: Context, requestCode: Int): PendingIntent {
        val intent = Intent(context, BootCompletedReceiver::class.java)
            .setAction(ACTION_RETRY)
        return PendingIntent.getBroadcast(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }
}
