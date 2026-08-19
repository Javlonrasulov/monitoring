package com.monitor.device.core.api

import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import com.monitor.device.core.BuildConfig
import com.monitor.device.core.auth.TokenStore
import com.monitor.device.core.model.ChatMessageDto
import com.monitor.device.core.model.ChatMessagesPage
import com.monitor.device.core.model.ChatThreadDto
import com.monitor.device.core.model.DeviceMeResponse
import com.monitor.device.core.model.DeviceStatusResponse
import com.monitor.device.core.model.DeviceStatusUpdate
import com.monitor.device.core.model.PairRequest
import com.monitor.device.core.model.PairResponse
import com.monitor.device.core.model.PublisherTokenResponse
import com.monitor.device.core.model.SendChatRequest
import com.monitor.device.core.model.SubscriptionDto
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.HttpException
import retrofit2.Retrofit
import java.util.concurrent.TimeUnit

/**
 * Device-facing API client for pairing, heartbeat, and WHIP publisher tokens.
 */
class DeviceApiClient(
    baseUrl: String,
    private val tokenStore: TokenStore,
    okHttpClient: OkHttpClient = defaultOkHttpClient(),
) {
    /** Raised when the backend no longer recognises this device's token. */
    class Unpaired(cause: Throwable? = null) :
        IllegalStateException("Device pairing is no longer valid", cause)

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        encodeDefaults = true
    }

    private val api: DeviceApi = Retrofit.Builder()
        .baseUrl(if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/")
        .client(okHttpClient)
        .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
        .build()
        .create(DeviceApi::class.java)

    suspend fun pair(request: PairRequest): PairResponse {
        val response = api.pair(request)
        tokenStore.saveSession(
            deviceId = response.deviceId,
            deviceName = response.name,
            organizationId = response.organizationId,
            branchId = response.branchId,
            deviceToken = response.deviceToken,
            apiKey = response.apiKey,
        )
        return response
    }

    suspend fun me(): DeviceMeResponse {
        return authorized(unpairOnNotFound = false) { api.me(it) }
    }

    suspend fun updateStatus(body: DeviceStatusUpdate): DeviceStatusResponse {
        return authorized { api.updateStatus(it, body) }
    }

    suspend fun publisherToken(): PublisherTokenResponse {
        return authorized { api.publisherToken(it) }
    }

    suspend fun chats(): List<ChatThreadDto> = authorized { api.chats(it) }

    suspend fun chatMessages(threadId: String, cursor: String? = null): ChatMessagesPage =
        authorized { api.chatMessages(it, threadId, cursor) }

    suspend fun sendChat(threadId: String, text: String): ChatMessageDto =
        authorized { api.sendChat(it, threadId, SendChatRequest(text)) }

    suspend fun readChat(threadId: String) {
        authorized { api.readChat(it, threadId) }
    }

    suspend fun subscription(): SubscriptionDto = authorized { api.subscription(it) }

    /**
     * Authentication failures and a missing device mean the pairing was
     * revoked server-side. Retrying can never fix it, so the stored session is
     * dropped and the app re-pairs.
     */
    private suspend fun <T> authorized(
        unpairOnNotFound: Boolean = true,
        call: suspend (String) -> T,
    ): T {
        return try {
            call(bearer())
        } catch (e: HttpException) {
            val gone = e.code() == 401 || e.code() == 403 || (unpairOnNotFound && e.code() == 404)
            if (gone) {
                tokenStore.clear()
                throw Unpaired(e)
            }
            throw e
        }
    }

    private fun bearer(): String {
        val token = tokenStore.deviceToken()
            ?: error("Device is not paired — missing device token")
        return "Bearer $token"
    }

    companion object {
        /** Single source of truth: `monitor.apiBaseUrl` in gradle.properties. */
        val DEFAULT_BASE_URL: String = BuildConfig.API_BASE_URL

        fun defaultOkHttpClient(): OkHttpClient {
            val logging = HttpLoggingInterceptor().apply {
                level = HttpLoggingInterceptor.Level.BASIC
            }
            return OkHttpClient.Builder()
                .connectTimeout(20, TimeUnit.SECONDS)
                .readTimeout(30, TimeUnit.SECONDS)
                .writeTimeout(30, TimeUnit.SECONDS)
                .addInterceptor(logging)
                .build()
        }
    }
}
