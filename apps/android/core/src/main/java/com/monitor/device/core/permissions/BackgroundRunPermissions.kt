package com.monitor.device.core.permissions

import android.app.Activity
import android.content.ComponentName
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.content.pm.PackageManager
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

    /** Ordered intents to try for OEM autostart / background activity. */
    fun autostartSettingsIntents(context: Context): List<Intent> {
        val pkg = context.packageName
        val manufacturer = Build.MANUFACTURER.lowercase()
        val brand = Build.BRAND.lowercase()

        val oem = buildList {
            if (isXiaomiFamily(manufacturer, brand)) {
                add(componentIntent("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"))
                add(componentIntent("com.miui.securitycenter", "com.miui.powercenter.PowerSettings"))
            }
            if (manufacturer.contains("huawei") || manufacturer.contains("honor") || brand.contains("honor")) {
                add(componentIntent("com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"))
                add(componentIntent("com.huawei.systemmanager", "com.huawei.systemmanager.optimize.process.ProtectActivity"))
            }
            if (manufacturer.contains("oppo") || manufacturer.contains("realme") || brand.contains("realme")) {
                add(componentIntent("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"))
                add(componentIntent("com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity"))
            }
            if (manufacturer.contains("vivo") || manufacturer.contains("iqoo") || brand.contains("iqoo")) {
                add(componentIntent("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"))
                add(componentIntent("com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.BgStartUpManager"))
            }
            if (manufacturer.contains("oneplus") || brand.contains("oneplus")) {
                add(componentIntent("com.oneplus.security", "com.oneplus.security.chainlaunch.view.ChainLaunchAppListActivity"))
            }
            if (manufacturer.contains("samsung") || brand.contains("samsung")) {
                add(componentIntent("com.samsung.android.lool", "com.samsung.android.sm.ui.battery.BatteryActivity"))
                add(componentIntent("com.samsung.android.lool", "com.samsung.android.sm.battery.ui.usage.CheckableAppListActivity"))
            }
            // Generic OEM screens (may exist on other devices).
            add(componentIntent("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"))
            add(componentIntent("com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"))
            add(componentIntent("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"))
            add(componentIntent("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"))
            add(componentIntent("com.oneplus.security", "com.oneplus.security.chainlaunch.view.ChainLaunchAppListActivity"))
        }

        val fallbacks = listOf(
            appDetailsIntent(pkg),
            Intent(Settings.ACTION_SETTINGS),
        )

        return (oem + fallbacks).distinctBy { intent ->
            intent.component?.let { "${it.packageName}/${it.className}" }
                ?: "${intent.action}:${intent.dataString}"
        }
    }

    /** Opens vendor autostart list or app details as fallback. */
    fun openAutostartSettings(context: Context): Boolean {
        for (intent in autostartSettingsIntents(context)) {
            if (tryLaunch(context, intent)) return true
        }
        return false
    }

    fun likelyNeedsAutostartPrompt(): Boolean {
        val m = Build.MANUFACTURER.lowercase()
        val b = Build.BRAND.lowercase()
        return isXiaomiFamily(m, b) ||
            m.contains("huawei") ||
            m.contains("honor") ||
            b.contains("honor") ||
            m.contains("oppo") ||
            m.contains("realme") ||
            b.contains("realme") ||
            m.contains("vivo") ||
            m.contains("iqoo") ||
            b.contains("iqoo") ||
            m.contains("oneplus") ||
            b.contains("oneplus") ||
            m.contains("samsung") ||
            b.contains("samsung")
    }

    private fun isXiaomiFamily(manufacturer: String, brand: String): Boolean {
        return manufacturer.contains("xiaomi") ||
            manufacturer.contains("redmi") ||
            manufacturer.contains("poco") ||
            brand.contains("redmi") ||
            brand.contains("poco")
    }

    private fun componentIntent(packageName: String, className: String): Intent {
        return Intent().setComponent(ComponentName(packageName, className))
    }

    private fun appDetailsIntent(packageName: String): Intent {
        return Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
            data = Uri.parse("package:$packageName")
        }
    }

    private fun tryLaunch(context: Context, intent: Intent): Boolean {
        if (intent.component != null && !isPackageInstalled(context, intent.component!!.packageName)) {
            return false
        }
        val activity = context.findActivity()
        return try {
            if (activity != null) {
                activity.startActivity(intent)
            } else {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.applicationContext.startActivity(intent)
            }
            true
        } catch (_: Exception) {
            false
        }
    }

    private fun isPackageInstalled(context: Context, packageName: String): Boolean {
        return try {
            context.packageManager.getPackageInfo(packageName, 0)
            true
        } catch (_: PackageManager.NameNotFoundException) {
            false
        }
    }

    private fun Context.findActivity(): Activity? {
        var current: Context = this
        while (current is ContextWrapper) {
            if (current is Activity) return current
            current = current.baseContext
        }
        return null
    }
}
