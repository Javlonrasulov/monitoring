package com.monitor.device.core.api

import com.monitor.device.core.model.ChangePasswordRequest
import com.monitor.device.core.model.ChatMediaPage
import com.monitor.device.core.model.ChatMessageDto
import com.monitor.device.core.model.ChatMessagesPage
import com.monitor.device.core.model.ChatSearchPage
import com.monitor.device.core.model.ChatThreadDto
import com.monitor.device.core.model.EmptyJsonBody
import com.monitor.device.core.model.DeviceMeResponse
import com.monitor.device.core.model.DeviceStatusResponse
import com.monitor.device.core.model.DeviceStatusUpdate
import com.monitor.device.core.model.EditChatRequest
import com.monitor.device.core.model.InitUploadRequest
import com.monitor.device.core.model.InitUploadResponse
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
import com.monitor.device.core.model.RecordingListResponse
import com.monitor.device.core.model.RecordingPlaybackRequest
import com.monitor.device.core.model.RecordingPlaybackResponse
import com.monitor.device.core.model.ViewerTokenResponse
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

interface DeviceApi {
    @GET("devices/pair-status")
    suspend fun pairStatus(
        @Query("phone") phone: String? = null,
        @Query("installId") installId: String? = null,
        @Query("signals") signals: String? = null,
    ): PairStatusResponse

    @POST("devices/pair")
    suspend fun pair(@Body request: PairRequest): PairResponse

    @GET("devices/me")
    suspend fun me(
        @Header("Authorization") authorization: String,
    ): DeviceMeResponse

    @PATCH("devices/me")
    suspend fun updateProfile(
        @Header("Authorization") authorization: String,
        @Body body: UpdateProfileRequest,
    ): DeviceMeResponse

    @PATCH("devices/me/password")
    suspend fun changePassword(
        @Header("Authorization") authorization: String,
        @Body body: ChangePasswordRequest,
    ): OkResponse

    @POST("devices/me/avatar")
    suspend fun uploadAvatar(
        @Header("Authorization") authorization: String,
        @Body body: UploadAvatarRequest,
    ): DeviceMeResponse

    @DELETE("devices/me/avatar")
    suspend fun deleteAvatar(
        @Header("Authorization") authorization: String,
    ): DeviceMeResponse

    @GET("devices/me/linked")
    suspend fun linkedDevices(
        @Header("Authorization") authorization: String,
    ): List<LinkedDeviceDto>

    @DELETE("devices/me/linked/{id}")
    suspend fun unlinkDevice(
        @Header("Authorization") authorization: String,
        @Path("id") id: String,
    ): OkResponse

    @POST("devices/me/pairing-codes")
    suspend fun createPairingCode(
        @Header("Authorization") authorization: String,
        @Body body: EmptyJsonBody = EmptyJsonBody(),
    ): PairingCodeResponse

    @POST("devices/me/link")
    suspend fun linkDevice(
        @Header("Authorization") authorization: String,
        @Body body: LinkDeviceRequest,
    ): LinkDeviceResponse

    @POST("streaming/devices/{id}/device-viewer-token")
    suspend fun deviceViewerToken(
        @Header("Authorization") authorization: String,
        @Path("id") id: String,
    ): ViewerTokenResponse

    @POST("devices/me/linked/{id}/camera")
    suspend fun setLinkedCamera(
        @Header("Authorization") authorization: String,
        @Path("id") id: String,
        @Body body: SetCameraFacingRequest,
    ): DeviceStatusResponse

    @GET("recordings/device/{deviceId}")
    suspend fun linkedRecordings(
        @Header("Authorization") authorization: String,
        @Path("deviceId") deviceId: String,
    ): RecordingListResponse

    @POST("recordings/device/{deviceId}/start")
    suspend fun startLinkedRecording(
        @Header("Authorization") authorization: String,
        @Path("deviceId") deviceId: String,
    ): OkResponse

    @POST("recordings/device/playback-url")
    suspend fun linkedRecordingPlayback(
        @Header("Authorization") authorization: String,
        @Body body: RecordingPlaybackRequest,
    ): RecordingPlaybackResponse

    @PATCH("devices/me/status")
    suspend fun updateStatus(
        @Header("Authorization") authorization: String,
        @Body body: DeviceStatusUpdate,
    ): DeviceStatusResponse

    @PUT("device-push-tokens")
    suspend fun registerPushToken(
        @Header("Authorization") authorization: String,
        @Body body: RegisterPushTokenRequest,
    ): OkResponse

    @POST("streaming/publisher-token")
    suspend fun publisherToken(
        @Header("Authorization") authorization: String,
    ): PublisherTokenResponse

    @GET("device-chats")
    suspend fun chats(
        @Header("Authorization") authorization: String,
    ): List<ChatThreadDto>

    @POST("device-chats/support")
    suspend fun openSupportChat(
        @Header("Authorization") authorization: String,
    ): ChatThreadDto

    @GET("device-chats/support/summary")
    suspend fun supportSummary(
        @Header("Authorization") authorization: String,
    ): SupportSummaryDto

    @GET("device-chats/{id}")
    suspend fun chatThread(
        @Header("Authorization") authorization: String,
        @Path("id") id: String,
    ): ChatThreadDto

    @GET("device-chats/{id}/messages")
    suspend fun chatMessages(
        @Header("Authorization") authorization: String,
        @Path("id") id: String,
        @Query("cursor") cursor: String? = null,
        @Query("take") take: Int? = null,
    ): ChatMessagesPage

    @GET("device-chats/{id}/search")
    suspend fun searchChat(
        @Header("Authorization") authorization: String,
        @Path("id") id: String,
        @Query("q") query: String,
    ): ChatSearchPage

    @GET("device-chats/{id}/media")
    suspend fun chatMedia(
        @Header("Authorization") authorization: String,
        @Path("id") id: String,
        @Query("kind") kind: String,
    ): ChatMediaPage

    @POST("device-chats/{id}/messages")
    suspend fun sendChat(
        @Header("Authorization") authorization: String,
        @Path("id") id: String,
        @Body body: SendChatRequest,
    ): ChatMessageDto

    @PATCH("device-chats/{id}/messages/{messageId}")
    suspend fun editChat(
        @Header("Authorization") authorization: String,
        @Path("id") id: String,
        @Path("messageId") messageId: String,
        @Body body: EditChatRequest,
    ): ChatMessageDto

    @DELETE("device-chats/{id}/messages/{messageId}")
    suspend fun deleteChat(
        @Header("Authorization") authorization: String,
        @Path("id") id: String,
        @Path("messageId") messageId: String,
        @Query("forEveryone") forEveryone: Boolean,
    ): OkResponse

    @POST("device-chats/{id}/messages/{messageId}/react")
    suspend fun reactChat(
        @Header("Authorization") authorization: String,
        @Path("id") id: String,
        @Path("messageId") messageId: String,
        @Body body: ReactChatRequest,
    ): ChatMessageDto

    @POST("device-chats/{id}/read")
    suspend fun readChat(
        @Header("Authorization") authorization: String,
        @Path("id") id: String,
    ): OkResponse

    @POST("device-chats/{id}/uploads")
    suspend fun initUpload(
        @Header("Authorization") authorization: String,
        @Path("id") id: String,
        @Body body: InitUploadRequest,
    ): InitUploadResponse

    @DELETE("device-chats/{id}/uploads/{uploadId}")
    suspend fun cancelUpload(
        @Header("Authorization") authorization: String,
        @Path("id") id: String,
        @Path("uploadId") uploadId: String,
    ): OkResponse

    @GET("device-subscriptions/me")
    suspend fun subscription(
        @Header("Authorization") authorization: String,
    ): SubscriptionDto

    @POST("device-subscriptions/invoices")
    suspend fun createPaymentInvoice(
        @Header("Authorization") authorization: String,
        @Body body: PurchasePlanRequest,
    ): PaymentInvoiceDto

    @GET("device-subscriptions/invoices/{id}")
    suspend fun paymentInvoice(
        @Header("Authorization") authorization: String,
        @Path("id") id: String,
    ): PaymentInvoiceDto
}
