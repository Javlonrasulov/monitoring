package com.monitor.device.push

import android.util.Log
import com.google.firebase.messaging.FirebaseMessaging
import com.monitor.device.core.api.DeviceApiClient
import com.monitor.device.core.auth.TokenStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

/**
 * Registers the FCM token with the API when the device is paired.
 * No-ops quietly when Firebase is not configured or the device is unpaired.
 */
object PushRegistrar {
    private const val TAG = "PushRegistrar"
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    fun refresh(apiClient: DeviceApiClient, tokenStore: TokenStore) {
        if (!tokenStore.isPaired()) return
        scope.launch {
            runCatching {
                val token = FirebaseMessaging.getInstance().token.await()
                if (token.isNullOrBlank()) return@runCatching
                apiClient.registerPushToken(token)
            }.onFailure {
                Log.w(TAG, "FCM token register skipped/failed", it)
            }
        }
    }

    fun registerToken(apiClient: DeviceApiClient, tokenStore: TokenStore, token: String) {
        if (!tokenStore.isPaired() || token.isBlank()) return
        scope.launch {
            runCatching { apiClient.registerPushToken(token) }
                .onFailure { Log.w(TAG, "FCM token register failed", it) }
        }
    }
}
