package com.monitor.device.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.monitor.device.MainActivity
import com.monitor.device.MonitorApp
import com.monitor.device.R

class ChatFirebaseMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        val app = application as? MonitorApp ?: return
        PushRegistrar.registerToken(app.apiClient, app.tokenStore, token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        val data = message.data
        val type = data["type"].orEmpty()
        if (type.isNotEmpty() && type != "chat.message") return

        val title =
            message.notification?.title
                ?: data["title"]
                ?: getString(R.string.chat_push_title)
        val body =
            message.notification?.body
                ?: data["body"]
                ?: getString(R.string.chat_push_body)
        val threadId = data["threadId"].orEmpty()

        ensureChannel()
        val open = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            if (threadId.isNotBlank()) {
                putExtra(MainActivity.EXTRA_CHAT_THREAD_ID, threadId)
            }
        }
        val pending = PendingIntent.getActivity(
            this,
            threadId.hashCode(),
            open,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification_chat)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(pending)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .build()

        try {
            NotificationManagerCompat.from(this).notify(
                NOTIFICATION_TAG,
                threadId.ifBlank { "chat" }.hashCode(),
                notification,
            )
        } catch (t: SecurityException) {
            Log.w(TAG, "Cannot post chat notification (permission?)", t)
        }
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java) ?: return
        val channel = NotificationChannel(
            CHANNEL_ID,
            getString(R.string.chat_push_channel_name),
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = getString(R.string.chat_push_channel_desc)
        }
        manager.createNotificationChannel(channel)
    }

    companion object {
        private const val TAG = "ChatFcm"
        private const val CHANNEL_ID = "chat_messages"
        private const val NOTIFICATION_TAG = "chat_message"
    }
}
