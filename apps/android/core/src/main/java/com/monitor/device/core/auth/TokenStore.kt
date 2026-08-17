package com.monitor.device.core.auth

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Secure storage for device pairing credentials.
 * Uses EncryptedSharedPreferences when available; falls back to private prefs.
 */
class TokenStore(context: Context) {
    private val prefs: SharedPreferences = createPrefs(context.applicationContext)

    fun isPaired(): Boolean = !deviceToken().isNullOrBlank() && !deviceId().isNullOrBlank()

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

    fun saveSession(
        deviceId: String,
        deviceName: String,
        organizationId: String,
        branchId: String,
        deviceToken: String,
        apiKey: String,
    ) {
        prefs.edit()
            .putString(KEY_DEVICE_ID, deviceId)
            .putString(KEY_DEVICE_NAME, deviceName)
            .putString(KEY_ORG_ID, organizationId)
            .putString(KEY_BRANCH_ID, branchId)
            .putString(KEY_DEVICE_TOKEN, deviceToken)
            .putString(KEY_API_KEY, apiKey)
            .apply()
    }

    fun clear() {
        prefs.edit().clear().apply()
    }

    private fun createPrefs(context: Context): SharedPreferences {
        return try {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
            EncryptedSharedPreferences.create(
                context,
                PREFS_NAME,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
            )
        } catch (_: Exception) {
            context.getSharedPreferences(PREFS_FALLBACK, Context.MODE_PRIVATE)
        }
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
        private const val KEY_AUTO_START = "auto_start_enabled"
    }
}
