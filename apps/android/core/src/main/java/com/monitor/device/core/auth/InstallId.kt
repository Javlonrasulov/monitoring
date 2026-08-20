package com.monitor.device.core.auth

import android.content.Context
import android.media.MediaDrm
import android.os.Build
import android.provider.Settings
import java.security.MessageDigest
import java.util.UUID

/**
 * Device fingerprint for binding the free trial to a physical phone.
 *
 * Combines:
 * - ANDROID_ID (stable for same app signing key on modern Android)
 * - Widevine MediaDrm id (often survives reinstall better)
 * - Build hardware profile (salt only, never used alone as a claim key)
 *
 * Primary [id] is a hash of all parts. [signals] are individual keys the server
 * stores so matching ANY of them blocks a second free trial.
 *
 * Hardware signals are recomputed on every call (prefs only cache the weak
 * UUID fallback). That way reinstall still resolves to the same aid/drm keys.
 */
data class DeviceFingerprint(
    val id: String,
    val signals: List<String>,
    val hasHardwareSignal: Boolean,
)

object InstallId {
    private const val PREFS = "monitor_install"
    private const val KEY_FALLBACK = "install_fallback_uid"

    fun get(context: Context): DeviceFingerprint {
        val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

        val androidId = runCatching {
            Settings.Secure.getString(
                context.applicationContext.contentResolver,
                Settings.Secure.ANDROID_ID,
            )
        }.getOrNull()?.trim().orEmpty()

        val drmId = widevineIdHex()
        val buildSalt = listOf(
            Build.BOARD,
            Build.BRAND,
            Build.DEVICE,
            Build.HARDWARE,
            Build.MANUFACTURER,
            Build.MODEL,
            Build.PRODUCT,
        ).joinToString("|")

        val hardwareSignals = buildList {
            if (androidId.length >= 8 && androidId != "9774d56d682e549c") {
                add("aid:$androidId")
            }
            if (!drmId.isNullOrBlank()) {
                add("drm:$drmId")
            }
        }.distinct()

        if (hardwareSignals.isNotEmpty()) {
            val material = listOfNotNull(
                hardwareSignals.firstOrNull { it.startsWith("aid:") },
                hardwareSignals.firstOrNull { it.startsWith("drm:") },
                "bld:$buildSalt",
            ).joinToString("\n")
            val id = "fp:${sha256Hex(material)}"
            val allSignals = (listOf(id) + hardwareSignals).distinct()
            return DeviceFingerprint(
                id = id,
                signals = allSignals,
                hasHardwareSignal = true,
            )
        }

        val fallback = prefs.getString(KEY_FALLBACK, null)?.trim().orEmpty().ifBlank {
            "uid:${UUID.randomUUID()}".also {
                prefs.edit().putString(KEY_FALLBACK, it).apply()
            }
        }
        return DeviceFingerprint(
            id = fallback,
            signals = listOf(fallback),
            hasHardwareSignal = false,
        )
    }

    private fun widevineIdHex(): String? {
        val uuid = UUID(-0x121074568629b532L, -0x5c37d8232ae2de13L)
        return runCatching {
            val drm = MediaDrm(uuid)
            try {
                val bytes = drm.getPropertyByteArray(MediaDrm.PROPERTY_DEVICE_UNIQUE_ID)
                bytes?.joinToString("") { b -> "%02x".format(b) }?.takeIf { it.length >= 8 }
            } finally {
                runCatching { drm.release() }
            }
        }.getOrNull()
    }

    private fun sha256Hex(value: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8))
        return digest.joinToString("") { b -> "%02x".format(b) }
    }
}
