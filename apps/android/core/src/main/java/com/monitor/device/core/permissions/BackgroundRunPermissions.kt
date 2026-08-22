package com.monitor.device.core.permissions

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings

/**
 * Battery exemption + OEM autostart settings so monitoring can resume after reboot.
 * There is no standard Android permission for autostart — we open the vendor screen once.
 */
object BackgroundRunPermissions {
    private const val PREFS = "monitor_setup_prefs"
    private const val KEY_BACKGROUND_SETUP_DONE = "background_setup_done"

    fun isBackgroundSetupDone(context: Context): Boolean {
        return context.applicationContext
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getBoolean(KEY_BACKGROUND_SETUP_DONE, false)
    }

    fun markBackgroundSetupDone(context: Context) {
        context.applicationContext
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_BACKGROUND_SETUP_DONE, true)
            .apply()
    }

    fun isBatteryOptimizationIgnored(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true
        val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return true
        return pm.isIgnoringBatteryOptimizations(context.packageName)
    }

    /** System dialog: allow app to run without battery restrictions. */
    fun batteryExemptionIntent(context: Context): Intent? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return null
        if (isBatteryOptimizationIgnored(context)) return null
        return Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
            data = Uri.parse("package:${context.packageName}")
        }
    }

    /** Opens vendor autostart list or app details as fallback. */
    fun openAutostartSettings(context: Context): Boolean {
        val app = context.applicationContext
        val pkg = app.packageName
        val candidates = listOf(
            // Xiaomi / Redmi / POCO
            Intent().setComponent(
                ComponentName(
                    "com.miui.securitycenter",
                    "com.miui.permcenter.autostart.AutoStartManagementActivity",
                ),
            ),
            Intent().setComponent(
                ComponentName(
                    "com.miui.securitycenter",
                    "com.miui.powercenter.PowerSettings",
                ),
            ),
            // Huawei / Honor
            Intent().setComponent(
                ComponentName(
                    "com.huawei.systemmanager",
                    "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity",
                ),
            ),
            Intent().setComponent(
                ComponentName(
                    "com.huawei.systemmanager",
                    "com.huawei.systemmanager.optimize.process.ProtectActivity",
                ),
            ),
            // Oppo / Realme
            Intent().setComponent(
                ComponentName(
                    "com.coloros.safecenter",
                    "com.coloros.safecenter.permission.startup.StartupAppListActivity",
                ),
            ),
            Intent().setComponent(
                ComponentName(
                    "com.oppo.safe",
                    "com.oppo.safe.permission.startup.StartupAppListActivity",
                ),
            ),
            // Vivo / iQOO
            Intent().setComponent(
                ComponentName(
                    "com.vivo.permissionmanager",
                    "com.vivo.permissionmanager.activity.BgStartUpManagerActivity",
                ),
            ),
            Intent().setComponent(
                ComponentName(
                    "com.iqoo.secure",
                    "com.iqoo.secure.ui.phoneoptimize.BgStartUpManager",
                ),
            ),
            // OnePlus
            Intent().setComponent(
                ComponentName(
                    "com.oneplus.security",
                    "com.oneplus.security.chainlaunch.view.ChainLaunchAppListActivity",
                ),
            ),
            // Samsung / stock — app details (user enables “Allow background activity”)
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.parse("package:$pkg")
            },
        )
        val pm = app.packageManager
        for (intent in candidates) {
            if (intent.resolveActivity(pm) == null) continue
            return runCatching {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                app.startActivity(intent)
                true
            }.getOrDefault(false)
        }
        return false
    }

    fun likelyNeedsAutostartPrompt(): Boolean {
        val m = Build.MANUFACTURER.lowercase()
        return m.contains("xiaomi") ||
            m.contains("redmi") ||
            m.contains("poco") ||
            m.contains("huawei") ||
            m.contains("honor") ||
            m.contains("oppo") ||
            m.contains("realme") ||
            m.contains("vivo") ||
            m.contains("iqoo") ||
            m.contains("oneplus") ||
            m.contains("samsung")
    }
}
