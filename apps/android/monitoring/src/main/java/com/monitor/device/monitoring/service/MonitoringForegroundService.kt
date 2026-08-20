package com.monitor.device.monitoring.service

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleService
import com.monitor.device.core.api.DeviceApiClient
import com.monitor.device.core.auth.TokenStore
import com.monitor.device.core.locale.AppLocale
import com.monitor.device.monitoring.MonitoringEngine
import com.monitor.device.monitoring.R
import com.monitor.device.monitoring.boot.BootRestartScheduler
import com.monitor.device.monitoring.stream.StreamQuality
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Foreground service that keeps monitoring alive with a visible notification.
 * Transparent by design — user can Stop or Open the app at any time.
 */
class MonitoringForegroundService : LifecycleService() {
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var engine: MonitoringEngine? = null
    private val startingEngine = AtomicBoolean(false)

    /**
     * The notification is user-facing, so its strings are resolved against the
     * currently selected language rather than the one active when the service
     * was created — the user may switch languages while monitoring runs.
     */
    private fun localized(): Context = AppLocale.wrap(this)

    override fun onCreate() {
        super.onCreate()
        instance = this
        ensureChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // LifecycleService uses this call to dispatch ON_START to its registry.
        super.onStartCommand(intent, flags, startId)
        when (intent?.action) {
            ACTION_STOP -> {
                serviceScope.launch {
                    runCatching { engine?.stop() }
                    engine = null
                    startingEngine.set(false)
                    started.set(false)
                    stopForeground(STOP_FOREGROUND_REMOVE)
                    stopSelf()
                }
                return START_NOT_STICKY
            }
            ACTION_START, ACTION_ENSURE, null -> {
                if (engine?.isStreaming() == true) {
                    started.set(true)
                    BootRestartScheduler.cancel(this)
                    return START_STICKY
                }
                if (engine != null && !startingEngine.get()) {
                    serviceScope.launch {
                        runCatching { engine?.stop() }
                        engine = null
                        startMonitoring()
                    }
                } else {
                    startMonitoring()
                }
            }
        }
        return START_STICKY
    }

    @SuppressLint("InlinedApi")
    private fun startMonitoring() {
        if (!hasCapturePermissions()) {
            // Android refuses a camera/microphone foreground service without the
            // runtime grants, and would kill the process instead of us.
            Log.w(TAG, "Camera/microphone permission missing, monitoring not started")
            started.set(false)
            stopSelf()
            return
        }

        // Refresh the channel too, so its name follows a language change.
        ensureChannel()
        val notification = buildNotification()
        val fgsType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA or
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
        } else {
            0
        }

        try {
            ServiceCompat.startForeground(
                this,
                NOTIFICATION_ID,
                notification,
                fgsType,
            )
        } catch (t: Throwable) {
            // e.g. ForegroundServiceStartNotAllowedException when the system
            // blocks a background start (boot, doze, OEM restrictions).
            Log.e(TAG, "Foreground service start refused by system", t)
            started.set(false)
            stopSelf()
            return
        }

        started.set(true)

        if (engine?.isRunning() == true || startingEngine.get()) {
            Log.i(TAG, "Engine already running")
            return
        }

        val tokenStore = TokenStore(this)
        if (!tokenStore.isPaired()) {
            Log.w(TAG, "Device is not paired, monitoring not started")
            started.set(false)
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return
        }

        // Do not cancel boot retries yet — wait until WHIP is actually streaming.
        startingEngine.set(true)
        val apiBase = intentApiBase()
        val api = DeviceApiClient(apiBase, tokenStore)
        val monitoringEngine = MonitoringEngine(
            context = this,
            apiClient = api,
            tokenStore = tokenStore,
            appVersion = runCatching {
                packageManager.getPackageInfo(packageName, 0).versionName
            }.getOrNull() ?: "1.0.3",
            onFatal = {
                serviceScope.launch {
                    runCatching { engine?.stop() }
                    started.set(false)
                    stopForeground(STOP_FOREGROUND_REMOVE)
                    stopSelf()
                }
            },
        )
        engine = monitoringEngine
        started.set(true)

        serviceScope.launch {
            runCatching {
                monitoringEngine.start(
                    lifecycleOwner = this@MonitoringForegroundService,
                    quality = StreamQuality.MEDIUM,
                )
            }.onFailure {
                Log.e(TAG, "Failed to start monitoring", it)
                started.set(false)
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
            startingEngine.set(false)
            // WHIP connects asynchronously; poll briefly then leave retries running.
            repeat(45) {
                if (monitoringEngine.isStreaming()) {
                    Log.i(TAG, "Publisher live — cancelling boot retries")
                    BootRestartScheduler.cancel(this@MonitoringForegroundService)
                    return@launch
                }
                delay(1_000)
            }
        }
    }

    private fun intentApiBase(): String {
        return DeviceApiClient.DEFAULT_BASE_URL
    }

    private fun hasCapturePermissions(): Boolean {
        val camera = ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
        val mic = ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
        return camera == PackageManager.PERMISSION_GRANTED &&
            mic == PackageManager.PERMISSION_GRANTED
    }

    private fun buildNotification(): Notification {
        // Tapping the notification body still opens the app; there are no
        // action buttons, so the notification stays minimal and compact.
        val openIntent = packageManager.getLaunchIntentForPackage(packageName)?.let {
            PendingIntent.getActivity(
                this,
                0,
                it,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
        }

        val strings = localized()

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(strings.getString(R.string.monitoring_notification_title))
            .setSmallIcon(R.drawable.ic_notification_monitor)
            .setColor(NOTIFICATION_ACCENT)
            .setColorized(false)
            .setOngoing(true)
            .setContentIntent(openIntent)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            // Keep it unobtrusive: no alert noise, no timestamp, phone-only.
            .setSilent(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setLocalOnly(true)
            .build()
    }

    private fun ensureChannel() {
        val manager = getSystemService(NotificationManager::class.java)
        val strings = localized()
        val channel = NotificationChannel(
            CHANNEL_ID,
            strings.getString(R.string.monitoring_channel_name),
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = strings.getString(R.string.monitoring_channel_desc)
            setSound(null, null)
            enableVibration(false)
            vibrationPattern = null
            enableLights(false)
            setShowBadge(false)
        }
        manager.createNotificationChannel(channel)
    }

    override fun onDestroy() {
        if (instance === this) instance = null
        started.set(false)
        serviceScope.launch {
            runCatching { engine?.stop() }
            serviceScope.cancel()
        }
        super.onDestroy()
    }

    override fun onBind(intent: Intent): IBinder? {
        super.onBind(intent)
        return null
    }

    companion object {
        private const val TAG = "MonitoringFgs"
        const val ACTION_START = "com.monitor.device.action.START_MONITORING"
        const val ACTION_ENSURE = "com.monitor.device.action.ENSURE_MONITORING"
        const val ACTION_STOP = "com.monitor.device.action.STOP_MONITORING"
        private const val CHANNEL_ID = "monitor_active"
        private const val NOTIFICATION_ID = 1001
        private const val NOTIFICATION_ACCENT = 0xFF0F766E.toInt()
        private val started = AtomicBoolean(false)
        private val chatCameraHold = AtomicBoolean(false)
        private val resumeAfterChatCamera = AtomicBoolean(false)

        @Volatile
        private var instance: MonitoringForegroundService? = null

        fun isStarted(): Boolean = started.get()

        /** True only when WHIP is actually publishing frames. */
        fun isPublishing(): Boolean = instance?.engine?.isStreaming() == true

        fun isChatCameraHold(): Boolean = chatCameraHold.get()

        /**
         * Temporarily stop the live camera so chat video notes can use it.
         * Does not change the user's auto-start preference.
         */
        fun pauseForChatCamera(context: Context) {
            chatCameraHold.set(true)
            resumeAfterChatCamera.set(started.get())
            if (started.get()) {
                stop(context)
            }
        }

        fun resumeAfterChatCamera(context: Context) {
            val shouldResume = resumeAfterChatCamera.getAndSet(false)
            chatCameraHold.set(false)
            if (shouldResume) {
                start(context)
            }
        }

        /** Returns false when Android refuses the start (background limits). */
        fun start(context: Context): Boolean {
            if (chatCameraHold.get()) return false
            val intent = Intent(context, MonitoringForegroundService::class.java)
                .setAction(ACTION_START)
            return runCatching {
                context.startForegroundService(intent)
            }.onFailure { Log.e(TAG, "Could not start monitoring service", it) }.isSuccess
        }

        /**
         * Start or restart until publishing. Used after reboot when the FGS
         * notification may be up but the camera stream never connected.
         */
        fun ensureStarted(context: Context): Boolean {
            if (chatCameraHold.get()) return false
            if (isPublishing()) return true
            val intent = Intent(context, MonitoringForegroundService::class.java)
                .setAction(ACTION_ENSURE)
            return runCatching {
                context.startForegroundService(intent)
            }.onFailure { Log.e(TAG, "Could not ensure monitoring service", it) }.isSuccess
        }

        fun stop(context: Context) {
            val intent = Intent(context, MonitoringForegroundService::class.java)
                .setAction(ACTION_STOP)
            runCatching { context.startService(intent) }
                .onFailure { Log.w(TAG, "Could not deliver stop intent", it) }
        }
    }
}
