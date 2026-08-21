package com.monitor.device.core.auth

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Secure storage for device pairing credentials.
 * Uses EncryptedSharedPreferences when available; falls back to private prefs.
 *
 * After reboot, Keystore can be briefly unavailable. We keep retrying encrypted
 * prefs so a temporary failure never looks like a permanent logout.
 */
class TokenStore(context: Context) {
    private val appContext = context.applicationContext
    @Volatile private var prefs: SharedPreferences = openPrefs(preferEncrypted = true)
    @Volatile private var usingFallback = prefs === fallbackPrefs()

    fun isPaired(): Boolean {
        rehydrate()
        return !deviceToken().isNullOrBlank() && !deviceId().isNullOrBlank()
    }

    /** Retry encrypted store (e.g. on resume after unlock). */
    fun rehydrate() {
        if (!usingFallback) return
        val encrypted = openEncryptedOrNull() ?: return
        val fallback = fallbackPrefs()
        val encToken = encrypted.getString(KEY_DEVICE_TOKEN, null)
        val fbToken = fallback.getString(KEY_DEVICE_TOKEN, null)
        when {
            !encToken.isNullOrBlank() -> {
                prefs = encrypted
                usingFallback = false
            }
            !fbToken.isNullOrBlank() -> {
                copySession(fallback, encrypted)
                prefs = encrypted
                usingFallback = false
                fallback.edit().clear().apply()
            }
            else -> {
                prefs = encrypted
                usingFallback = false
            }
        }
    }

    fun deviceId(): String? = prefs.getString(KEY_DEVICE_ID, null)

    fun deviceName(): String? = prefs.getString(KEY_DEVICE_NAME, null)

    fun organizationId(): String? = prefs.getString(KEY_ORG_ID, null)

    fun branchId(): String? = prefs.getString(KEY_BRANCH_ID, null)

    fun deviceToken(): String? = prefs.getString(KEY_DEVICE_TOKEN, null)

    fun apiKey(): String? = prefs.getString(KEY_API_KEY, null)

    fun isAutoStartEnabled(): Boolean = prefs.getBoolean(KEY_AUTO_START, true)

    fun setAutoStartEnabled(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_AUTO_START, enabled).apply()
    }

    fun userId(): String? = prefs.getString(KEY_USER_ID, null)

    fun saveUserId(userId: String) {
        prefs.edit().putString(KEY_USER_ID, userId).apply()
    }

    fun saveDeviceName(name: String) {
        prefs.edit().putString(KEY_DEVICE_NAME, name).apply()
    }

    fun saveSession(
        deviceId: String,
        deviceName: String,
        organizationId: String,
        branchId: String,
        deviceToken: String,
        apiKey: String,
        userId: String? = null,
    ) {
        rehydrate()
        prefs.edit()
            .putString(KEY_DEVICE_ID, deviceId)
            .putString(KEY_DEVICE_NAME, deviceName)
            .putString(KEY_ORG_ID, organizationId)
            .putString(KEY_BRANCH_ID, branchId)
            .putString(KEY_DEVICE_TOKEN, deviceToken)
            .putString(KEY_API_KEY, apiKey)
            .apply {
                if (!userId.isNullOrBlank()) putString(KEY_USER_ID, userId)
            }
            .apply()
    }

    fun clear() {
        prefs.edit().clear().apply()
        // Also clear the other store so a stale copy cannot resurrect a deleted session.
        runCatching {
            if (usingFallback) openEncryptedOrNull()?.edit()?.clear()?.apply()
            else fallbackPrefs().edit().clear().apply()
        }
    }

    private fun openPrefs(preferEncrypted: Boolean): SharedPreferences {
        if (preferEncrypted) {
            openEncryptedOrNull()?.let { return it }
        }
        android.util.Log.w("TokenStore", "Using fallback prefs; will retry encrypted later")
        return fallbackPrefs()
    }

    private fun openEncryptedOrNull(): SharedPreferences? {
        var lastError: Exception? = null
        repeat(5) { attempt ->
            try {
                val masterKey = MasterKey.Builder(appContext)
                    .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                    .build()
                return EncryptedSharedPreferences.create(
                    appContext,
                    PREFS_NAME,
                    masterKey,
                    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
                )
            } catch (e: Exception) {
                lastError = e
                if (attempt < 4) {
                    try {
                        Thread.sleep(120L * (attempt + 1))
                    } catch (_: InterruptedException) {
                        Thread.currentThread().interrupt()
                    }
                }
            }
        }
        android.util.Log.w("TokenStore", "Encrypted prefs unavailable", lastError)
        return null
    }

    private fun fallbackPrefs(): SharedPreferences =
        appContext.getSharedPreferences(PREFS_FALLBACK, Context.MODE_PRIVATE)

    private fun copySession(from: SharedPreferences, to: SharedPreferences) {
        to.edit()
            .putString(KEY_DEVICE_ID, from.getString(KEY_DEVICE_ID, null))
            .putString(KEY_DEVICE_NAME, from.getString(KEY_DEVICE_NAME, null))
            .putString(KEY_ORG_ID, from.getString(KEY_ORG_ID, null))
            .putString(KEY_BRANCH_ID, from.getString(KEY_BRANCH_ID, null))
            .putString(KEY_DEVICE_TOKEN, from.getString(KEY_DEVICE_TOKEN, null))
            .putString(KEY_API_KEY, from.getString(KEY_API_KEY, null))
            .putString(KEY_USER_ID, from.getString(KEY_USER_ID, null))
            .putBoolean(KEY_AUTO_START, from.getBoolean(KEY_AUTO_START, true))
            .apply()
    }

    companion object {
        private const val PREFS_NAME = "monitor_device_secure"
        private const val PREFS_FALLBACK = "monitor_device_prefs"
        private const val KEY_DEVICE_ID = "device_id"
        private const val KEY_DEVICE_NAME = "device_name"
        private const val KEY_ORG_ID = "organization_id"
        private const val KEY_BRANCH_ID = "branch_id"
        private const val KEY_DEVICE_TOKEN = "device_token"
        private const val KEY_API_KEY = "api_key"
        private const val KEY_USER_ID = "user_id"
        private const val KEY_AUTO_START = "auto_start_enabled"
    }
}
