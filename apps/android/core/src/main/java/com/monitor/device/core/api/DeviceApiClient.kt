package com.monitor.device.core.api

import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import com.monitor.device.core.BuildConfig
import com.monitor.device.core.auth.TokenStore
import com.monitor.device.core.model.ChangePasswordRequest
import com.monitor.device.core.model.ChatMediaPage
import com.monitor.device.core.model.ChatMessageDto
import com.monitor.device.core.model.ChatMessagesPage
import com.monitor.device.core.model.ChatSearchPage
import com.monitor.device.core.model.ChatThreadDto
import com.monitor.device.core.model.DeviceMeResponse
import com.monitor.device.core.model.DeviceStatusResponse
import com.monitor.device.core.model.DeviceStatusUpdate
import com.monitor.device.core.model.EditChatRequest
import com.monitor.device.core.model.InitUploadRequest
import com.monitor.device.core.model.EmptyJsonBody
import com.monitor.device.core.model.LinkDeviceRequest
import com.monitor.device.core.model.LinkDeviceResponse
import com.monitor.device.core.model.LinkedDeviceDto
import com.monitor.device.core.model.OkResponse
import com.monitor.device.core.model.PairingCodeResponse
import com.monitor.device.core.model.PairRequest
import com.monitor.device.core.model.PairResponse
import com.monitor.device.core.model.PairStatusResponse
import com.monitor.device.core.model.PublisherTokenResponse
import com.monitor.device.core.model.PaymentInvoiceDto
import com.monitor.device.core.model.PurchasePlanRequest
import com.monitor.device.core.model.ReactChatRequest
import com.monitor.device.core.model.RegisterPushTokenRequest
import com.monitor.device.core.model.SendChatRequest
import com.monitor.device.core.model.SetCameraFacingRequest
import com.monitor.device.core.model.SubscriptionDto
import com.monitor.device.core.model.SupportSummaryDto
import com.monitor.device.core.model.UpdateProfileRequest
import com.monitor.device.core.model.UploadAvatarRequest
import com.monitor.device.core.model.ViewerTokenResponse
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.logging.HttpLoggingInterceptor
import okio.BufferedSink
import retrofit2.HttpException
import retrofit2.Retrofit
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * Device-facing API client for pairing, heartbeat, chat, and WHIP publisher tokens.
 */
class DeviceApiClient(
    baseUrl: String,
    private val tokenStore: TokenStore,
    okHttpClient: OkHttpClient = defaultOkHttpClient(),
) {
    class Unpaired(cause: Throwable? = null) :
        IllegalStateException("Device pairing is no longer valid", cause)

    val apiBaseUrl: String = if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/"

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        encodeDefaults = true
    }

    private val http = okHttpClient

    private val api: DeviceApi = Retrofit.Builder()
        .baseUrl(apiBaseUrl)
        .client(okHttpClient)
        .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
        .build()
        .create(DeviceApi::class.java)

    suspend fun pairStatus(
        phone: String,
        installId: String? = null,
        signals: List<String> = emptyList(),
    ): PairStatusResponse {
        return api.pairStatus(
            phone = phone,
            installId = installId,
            signals = signals.takeIf { it.isNotEmpty() }?.joinToString(","),
        )
    }

    suspend fun pair(request: PairRequest): PairResponse {
        val response = api.pair(request)
        tokenStore.saveSession(
            deviceId = response.deviceId,
            deviceName = response.name,
            organizationId = response.organizationId,
            branchId = response.branchId,
            deviceToken = response.deviceToken,
            apiKey = response.apiKey,
            userId = response.userId,
        )
        return response
    }

    suspend fun me(): DeviceMeResponse {
        val me = authorized(unpairOnNotFound = false) { api.me(it) }
        me.userId?.let(tokenStore::saveUserId)
        me.name?.takeIf { it.isNotBlank() }?.let(tokenStore::saveDeviceName)
        return me
    }

    suspend fun updateProfile(name: String? = null, phone: String? = null): DeviceMeResponse {
        val me = authorized(unpairOnFailure = false) {
            api.updateProfile(it, UpdateProfileRequest(name = name, phone = phone))
        }
        me.userId?.let(tokenStore::saveUserId)
        me.name?.takeIf { it.isNotBlank() }?.let(tokenStore::saveDeviceName)
        return me
    }

    suspend fun changePassword(currentPassword: String, newPassword: String) {
        authorized(unpairOnFailure = false) {
            api.changePassword(it, ChangePasswordRequest(currentPassword, newPassword))
        }
    }

    suspend fun openSupportChat(): ChatThreadDto =
        authorized { api.openSupportChat(it) }

    suspend fun supportSummary(): SupportSummaryDto =
        authorized { api.supportSummary(it) }

    suspend fun deleteAvatar(): DeviceMeResponse =
        authorized(unpairOnFailure = false) { api.deleteAvatar(it) }

    suspend fun updateStatus(body: DeviceStatusUpdate): DeviceStatusResponse {
        return authorized { api.updateStatus(it, body) }
    }

    suspend fun registerPushToken(token: String): OkResponse =
        authorized(unpairOnFailure = false) {
            api.registerPushToken(it, RegisterPushTokenRequest(token = token, platform = "ANDROID"))
        }

    suspend fun publisherToken(): PublisherTokenResponse {
        return authorized { api.publisherToken(it) }
    }

    suspend fun chats(): List<ChatThreadDto> = authorized { api.chats(it) }

    suspend fun chatThread(threadId: String): ChatThreadDto =
        authorized { api.chatThread(it, threadId) }

    suspend fun chatMessages(threadId: String, cursor: String? = null, take: Int = 40): ChatMessagesPage =
        authorized { api.chatMessages(it, threadId, cursor, take) }

    suspend fun searchChat(threadId: String, query: String): ChatSearchPage =
        authorized { api.searchChat(it, threadId, query) }

    suspend fun chatMedia(threadId: String, kind: String): ChatMediaPage =
        authorized { api.chatMedia(it, threadId, kind) }

    suspend fun sendChat(
        threadId: String,
        text: String,
        replyToId: String? = null,
        clientId: String? = null,
        forwardedFromId: String? = null,
    ): ChatMessageDto =
        authorized {
            api.sendChat(
                it,
                threadId,
                SendChatRequest(
                    text = text,
                    replyToId = replyToId,
                    clientId = clientId,
                    forwardedFromId = forwardedFromId,
                ),
            )
        }

    suspend fun editChat(threadId: String, messageId: String, text: String): ChatMessageDto =
        authorized { api.editChat(it, threadId, messageId, EditChatRequest(text)) }

    suspend fun deleteChat(threadId: String, messageId: String, forEveryone: Boolean): OkResponse =
        authorized { api.deleteChat(it, threadId, messageId, forEveryone) }

    suspend fun reactChat(threadId: String, messageId: String, emoji: String): ChatMessageDto =
        authorized { api.reactChat(it, threadId, messageId, ReactChatRequest(emoji)) }

    suspend fun readChat(threadId: String) {
        authorized { api.readChat(it, threadId) }
    }

    suspend fun subscription(): SubscriptionDto = authorized { api.subscription(it) }

    suspend fun subscriptionPeek(): SubscriptionDto =
        authorized(unpairOnFailure = false) { api.subscription(it) }

    suspend fun linkedDevices(): List<LinkedDeviceDto> =
        authorized(unpairOnFailure = false) { api.linkedDevices(it) }

    suspend fun unlinkDevice(deviceId: String): OkResponse =
        authorized(unpairOnFailure = false) { api.unlinkDevice(it, deviceId) }

    suspend fun createPairingCode(): PairingCodeResponse =
        authorized(unpairOnFailure = false) {
            api.createPairingCode(it, EmptyJsonBody())
        }

    suspend fun linkDevice(code: String): LinkDeviceResponse =
        authorized(unpairOnFailure = false) {
            val response = api.linkDevice(it, LinkDeviceRequest(code))
            val token = response.deviceToken
            val orgId = response.organizationId
            val branchId = response.branchId
            val deviceId = tokenStore.deviceId()
            val apiKey = tokenStore.apiKey()
            if (
                !token.isNullOrBlank() &&
                !orgId.isNullOrBlank() &&
                !branchId.isNullOrBlank() &&
                !deviceId.isNullOrBlank() &&
                !apiKey.isNullOrBlank()
            ) {
                tokenStore.saveSession(
                    deviceId = deviceId,
                    deviceName = tokenStore.deviceName().orEmpty(),
                    organizationId = orgId,
                    branchId = branchId,
                    deviceToken = token,
                    apiKey = apiKey,
                    userId = tokenStore.userId(),
                )
            }
            response
        }

    suspend fun createPaymentInvoice(plan: String): PaymentInvoiceDto =
        authorized(unpairOnFailure = false) {
            api.createPaymentInvoice(it, PurchasePlanRequest(plan))
        }

    suspend fun paymentInvoice(id: String): PaymentInvoiceDto =
        authorized(unpairOnFailure = false) { api.paymentInvoice(it, id) }

    suspend fun deviceViewerToken(deviceId: String): ViewerTokenResponse =
        authorized(unpairOnFailure = false) { api.deviceViewerToken(it, deviceId) }

    suspend fun setLinkedCamera(deviceId: String, facing: String): DeviceStatusResponse =
        authorized(unpairOnFailure = false) {
            api.setLinkedCamera(it, deviceId, SetCameraFacingRequest(facing))
        }

    fun mediaUrl(threadId: String, messageId: String, thumb: Boolean = false, download: Boolean = false): String {
        val path = if (thumb) {
            "device-chats/$threadId/files/$messageId/thumb"
        } else {
            "device-chats/$threadId/files/$messageId"
        }
        val extra = if (download) "?download=1" else ""
        return apiBaseUrl + path + extra
    }

    fun avatarUrl(userId: String?, updatedAt: String? = null): String? {
        if (userId.isNullOrBlank()) return null
        val version = updatedAt?.takeIf { it.isNotBlank() }?.let { "?v=$it" }.orEmpty()
        return "${apiBaseUrl}device-chats/avatars/$userId$version"
    }

    suspend fun uploadAvatar(file: File): DeviceMeResponse = withContext(Dispatchers.IO) {
        val imageBase64 = android.util.Base64.encodeToString(
            file.readBytes(),
            android.util.Base64.NO_WRAP,
        )
        authorized(unpairOnFailure = false) {
            api.uploadAvatar(it, UploadAvatarRequest(imageBase64))
        }.also { it.userId?.let(tokenStore::saveUserId) }
    }

    fun authorizationHeader(): String = bearer()

    suspend fun uploadChatFile(
        threadId: String,
        file: File,
        fileName: String,
        mimeType: String,
        messageType: String,
        durationMs: Int? = null,
        width: Int? = null,
        height: Int? = null,
        replyToId: String? = null,
        clientId: String? = null,
        albumId: String? = null,
        waveformJson: String? = null,
        text: String? = null,
        thumbnail: File? = null,
        onProgress: (Float) -> Unit = {},
    ): ChatMessageDto = withContext(Dispatchers.IO) {
        val auth = bearer()
        val init = authorized(unpairOnFailure = false) {
            api.initUpload(
                it,
                threadId,
                InitUploadRequest(
                    fileName = fileName,
                    mimeType = mimeType,
                    fileSize = file.length(),
                    messageType = messageType,
                    durationMs = durationMs,
                    width = width,
                    height = height,
                    replyToId = replyToId,
                    clientId = clientId,
                    albumId = albumId,
                    waveformJson = waveformJson,
                    text = text,
                ),
            )
        }
        val chunkSize = init.chunkSize.coerceAtLeast(32 * 1024)
        val total = file.length().coerceAtLeast(1L)
        var sent = 0L
        var index = 0
        file.inputStream().use { input ->
            val buffer = ByteArray(chunkSize)
            while (true) {
                val read = input.read(buffer)
                if (read <= 0) break
                val bytes = if (read == buffer.size) buffer else buffer.copyOf(read)
                val request = Request.Builder()
                    .url("${apiBaseUrl}device-chats/$threadId/uploads/${init.uploadId}/chunks/$index")
                    .header("Authorization", auth)
                    .put(object : RequestBody() {
                        override fun contentType() = "application/octet-stream".toMediaType()
                        override fun contentLength() = bytes.size.toLong()
                        override fun writeTo(sink: BufferedSink) {
                            sink.write(bytes)
                        }
                    })
                    .build()
                http.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) {
                        runCatching { api.cancelUpload(auth, threadId, init.uploadId) }
                        throw IllegalStateException("Upload failed (${response.code})")
                    }
                }
                sent += read
                index += 1
                onProgress((sent.toFloat() / total.toFloat()).coerceIn(0f, 0.95f))
            }
        }
        val completeReq = Request.Builder()
            .url("${apiBaseUrl}device-chats/$threadId/uploads/${init.uploadId}/complete")
            .header("Authorization", auth)
            .post(RequestBody.create("application/json".toMediaType(), "{}"))
            .build()
        val message = http.newCall(completeReq).execute().use { response ->
            val body = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                throw IllegalStateException("Upload complete failed (${response.code})")
            }
            json.decodeFromString(ChatMessageDto.serializer(), body)
        }
        if (thumbnail != null && thumbnail.exists() && thumbnail.length() > 0) {
            val thumbReq = Request.Builder()
                .url("${apiBaseUrl}device-chats/$threadId/messages/${message.id}/thumbnail")
                .header("Authorization", auth)
                .header("Content-Type", "image/jpeg")
                .post(RequestBody.create("image/jpeg".toMediaType(), thumbnail))
                .build()
            runCatching { http.newCall(thumbReq).execute().close() }
        }
        onProgress(1f)
        message
    }

    suspend fun cancelUpload(threadId: String, uploadId: String) {
        runCatching { authorized { api.cancelUpload(it, threadId, uploadId) } }
    }

    private suspend fun <T> authorized(
        unpairOnNotFound: Boolean = true,
        unpairOnFailure: Boolean = true,
        call: suspend (String) -> T,
    ): T {
        return try {
            call(bearer())
        } catch (e: HttpException) {
            // Only a real auth failure should unpair. Chat 403/404 (missing thread,
            // expired upload) must not send the user back to login.
            if (unpairOnFailure && e.code() == 401) {
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
        val DEFAULT_BASE_URL: String = BuildConfig.API_BASE_URL

        fun errorMessage(error: Throwable, fallback: String): String {
            val http = error as? HttpException
            val raw = http?.response()?.errorBody()?.string().orEmpty()
            if (raw.isNotBlank()) {
                val parsed = runCatching { Json { ignoreUnknownKeys = true }.parseToJsonElement(raw) }.getOrNull()
                val obj = parsed as? kotlinx.serialization.json.JsonObject
                val value = obj?.get("message")
                val message = when (value) {
                    is kotlinx.serialization.json.JsonPrimitive -> value.content
                    is kotlinx.serialization.json.JsonArray ->
                        value.mapNotNull { (it as? kotlinx.serialization.json.JsonPrimitive)?.content }
                            .joinToString("\n")
                    else -> null
                }
                if (!message.isNullOrBlank()) return message
            }
            return error.message?.takeIf { it.isNotBlank() } ?: fallback
        }

        fun defaultOkHttpClient(): OkHttpClient {
            val logging = HttpLoggingInterceptor().apply {
                level = HttpLoggingInterceptor.Level.BASIC
            }
            return OkHttpClient.Builder()
                .connectTimeout(20, TimeUnit.SECONDS)
                .readTimeout(120, TimeUnit.SECONDS)
                .writeTimeout(120, TimeUnit.SECONDS)
                .addInterceptor(logging)
                .build()
        }
    }
}
