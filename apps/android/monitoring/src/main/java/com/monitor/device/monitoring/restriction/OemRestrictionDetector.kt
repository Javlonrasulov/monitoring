package com.monitor.device.monitoring.restriction

import android.content.Context
import android.os.Build
import android.os.PowerManager

/**
 * Detects OEM / OS background camera restrictions without hardcoding a single model.
 * When screen is off and manufacturer is known to restrict camera, report DEVICE_RESTRICTION.
 */
class OemRestrictionDetector(
    private val context: Context,
) {
    fun detectCameraBackgroundRestriction(screenInteractive: Boolean): Restriction? {
        if (screenInteractive) return null

        val manufacturer = Build.MANUFACTURER.orEmpty().lowercase()
        val restrictedVendors = setOf(
            "xiaomi", "redmi", "oppo", "vivo", "realme", "huawei", "honor", "oneplus",
        )

        // Samsung and stock AOSP often allow camera in FGS; many CN OEMs kill background camera.
        if (manufacturer in restrictedVendors) {
            return Restriction(
                code = "DEVICE_RESTRICTION",
                message = "Background camera may be limited by OEM power policy while screen is off",
            )
        }

        // If device is in deep idle / ignoring battery optimizations unset, hint restriction.
        val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        val pkg = context.packageName
        if (!pm.isIgnoringBatteryOptimizations(pkg)) {
            return Restriction(
                code = "DEVICE_RESTRICTION",
                message = "Battery optimization may interrupt monitoring; allow unrestricted battery",
            )
        }

        return null
    }

    data class Restriction(
        val code: String,
        val message: String,
    )
}
