package com.monitor.device

import android.app.Application
import android.content.Context
import com.monitor.device.core.api.DeviceApiClient
import com.monitor.device.core.auth.TokenStore
import com.monitor.device.core.locale.AppLocale
import com.monitor.device.push.PushRegistrar

class MonitorApp : Application() {
    override fun attachBaseContext(base: Context) {
        super.attachBaseContext(AppLocale.wrap(base))
    }

    lateinit var tokenStore: TokenStore
        private set
    lateinit var apiClient: DeviceApiClient
        private set

    override fun onCreate() {
        super.onCreate()
        tokenStore = TokenStore(this)
        apiClient = DeviceApiClient(
            baseUrl = BuildConfig.API_BASE_URL,
            tokenStore = tokenStore,
        )
        PushRegistrar.refresh(apiClient, tokenStore)
    }
}
