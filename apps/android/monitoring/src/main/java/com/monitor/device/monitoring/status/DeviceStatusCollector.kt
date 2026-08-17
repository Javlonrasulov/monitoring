package com.monitor.device.monitoring.status

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import com.monitor.device.core.model.DeviceStatusUpdate
import com.monitor.device.core.model.NetworkTypeLabel

/**
 * Collects transparent device health signals for heartbeat reporting.
 */
class DeviceStatusCollector(
    private val context: Context,
) {
    data class Snapshot(
        val batteryPercent: Int?,
        val charging: Boolean,
        val batterySaver: Boolean,
        val thermalState: String,
        val networkType: NetworkTypeLabel,
        val networkQuality: Int,
    )

    fun collect(): Snapshot {
        val battery = readBattery()
        return Snapshot(
            batteryPercent = battery.first,
            charging = battery.second,
            batterySaver = isPowerSaveMode(),
            thermalState = readThermalState(),
            networkType = readNetworkType(),
            networkQuality = estimateNetworkQuality(),
        )
    }

    fun toStatusUpdate(
        status: String,
        appVersion: String? = null,
        errorCode: String? = null,
        errorMessage: String? = null,
    ): DeviceStatusUpdate {
        val snap = collect()
        return DeviceStatusUpdate(
            status = status,
            batteryPercent = snap.batteryPercent,
            charging = snap.charging,
            batterySaver = snap.batterySaver,
            thermalState = snap.thermalState,
            networkType = snap.networkType.name,
            networkQuality = snap.networkQuality,
            errorCode = errorCode,
            errorMessage = errorMessage,
            appVersion = appVersion,
            androidVersion = Build.VERSION.RELEASE,
            deviceModel = "${Build.MANUFACTURER} ${Build.MODEL}",
        )
    }

    private fun readBattery(): Pair<Int?, Boolean> {
        val intent = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
            ?: return null to false
        val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
        val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
        val percent = if (level >= 0 && scale > 0) {
            ((level * 100f) / scale).toInt().coerceIn(0, 100)
        } else {
            null
        }
        val status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
        val charging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
            status == BatteryManager.BATTERY_STATUS_FULL
        return percent to charging
    }

    private fun isPowerSaveMode(): Boolean {
        val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        return pm.isPowerSaveMode
    }

    private fun readThermalState(): String {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return "UNKNOWN"
        val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        return when (pm.currentThermalStatus) {
            PowerManager.THERMAL_STATUS_NONE -> "NONE"
            PowerManager.THERMAL_STATUS_LIGHT -> "LIGHT"
            PowerManager.THERMAL_STATUS_MODERATE -> "MODERATE"
            PowerManager.THERMAL_STATUS_SEVERE -> "SEVERE"
            PowerManager.THERMAL_STATUS_CRITICAL -> "CRITICAL"
            PowerManager.THERMAL_STATUS_EMERGENCY -> "EMERGENCY"
            PowerManager.THERMAL_STATUS_SHUTDOWN -> "SHUTDOWN"
            else -> "UNKNOWN"
        }
    }

    private fun readNetworkType(): NetworkTypeLabel {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = cm.activeNetwork ?: return NetworkTypeLabel.UNKNOWN
        val caps = cm.getNetworkCapabilities(network) ?: return NetworkTypeLabel.UNKNOWN
        return when {
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> NetworkTypeLabel.WIFI
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> NetworkTypeLabel.MOBILE
            else -> NetworkTypeLabel.UNKNOWN
        }
    }

    private fun estimateNetworkQuality(): Int {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = cm.activeNetwork ?: return 0
        val caps = cm.getNetworkCapabilities(network) ?: return 0
        if (!caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) return 0
        val down = caps.linkDownstreamBandwidthKbps
        return when {
            down <= 0 -> 40
            down < 1_000 -> 25
            down < 5_000 -> 50
            down < 20_000 -> 75
            else -> 90
        }
    }
}
