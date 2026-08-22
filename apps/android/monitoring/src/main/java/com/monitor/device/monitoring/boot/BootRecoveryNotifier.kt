package com.monitor.device.monitoring.boot

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.monitor.device.core.auth.TokenStore
import com.monitor.device.monitoring.R
import com.monitor.device.monitoring.service.MonitoringForegroundService

/**
 * When Samsung/OEM blocks background camera start after reboot, show a tap-to-resume
 * notification so the user can restore monitoring with one tap (opens trampoline).
 */
object BootRecoveryNotifier {
    private const val CHANNEL_ID = "monitor_boot_recovery"
    private const val NOTIFICATION_ID = 1002

    fun update(context: Context) {
        val app = context.applicationContext
        val store = runCatching { TokenStore(app) }.getOrNull() ?: return
        if (!store.isPaired() || !store.isAutoStartEnabled()) {
            cancel(app)
            return
        }
        if (!hasCapturePermissions(app)) return
        if (MonitoringForegroundService.isPublishing()) {
            cancel(app)
            return
        }
        if (MonitoringForegroundService.isChatCameraHold()) return

        ensureChannel(app)
        val tap = PendingIntent.getActivity(
            app,
            0,
            Intent(app, BootTrampolineActivity::class.java)
                .addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_CLEAR_TOP or
                        Intent.FLAG_ACTIVITY_NO_ANIMATION,
                ),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val title = app.getString(R.string.boot_recovery_title)
        val body = app.getString(R.string.boot_recovery_text).trim()
        val builder = NotificationCompat.Builder(app, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification_monitor)
            .setContentTitle(title)
            .setContentIntent(tap)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        if (body.isNotEmpty()) {
            builder
                .setContentText(body)
                .setStyle(NotificationCompat.BigTextStyle().bigText(body))
        }
        val notification = builder.build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(
                app,
                Manifest.permission.POST_NOTIFICATIONS,
            ) == PackageManager.PERMISSION_GRANTED
            if (!granted) return
        }
        NotificationManagerCompat.from(app).notify(NOTIFICATION_ID, notification)
    }

    fun cancel(context: Context) {
        NotificationManagerCompat.from(context.applicationContext).cancel(NOTIFICATION_ID)
    }

    private fun hasCapturePermissions(context: Context): Boolean {
        val camera = ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA)
        val mic = ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO)
        return camera == PackageManager.PERMISSION_GRANTED &&
            mic == PackageManager.PERMISSION_GRANTED
    }

    private fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        val channel = NotificationChannel(
            CHANNEL_ID,
            context.getString(R.string.boot_recovery_channel_name),
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = context.getString(R.string.boot_recovery_channel_desc)
        }
        manager.createNotificationChannel(channel)
    }
}
