package com.monitor.device.core.api

import com.monitor.device.core.model.ChatMessageDto
import com.monitor.device.core.model.ChatMessagesPage
import com.monitor.device.core.model.ChatThreadDto
import com.monitor.device.core.model.DeviceMeResponse
import com.monitor.device.core.model.DeviceStatusResponse
import com.monitor.device.core.model.DeviceStatusUpdate
import com.monitor.device.core.model.OkResponse
import com.monitor.device.core.model.PairRequest
import com.monitor.device.core.model.PairResponse
import com.monitor.device.core.model.PublisherTokenResponse
import com.monitor.device.core.model.SendChatRequest
import com.monitor.device.core.model.SubscriptionDto
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.PATCH
import retrofit2.http.POST

interface DeviceApi {
    @POST("devices/pair")
    suspend fun pair(@Body request: PairRequest): PairResponse

    @GET("devices/me")
    suspend fun me(
        @Header("Authorization") authorization: String,
    ): DeviceMeResponse

    @PATCH("devices/me/status")
    suspend fun updateStatus(
        @Header("Authorization") authorization: String,
        @Body body: DeviceStatusUpdate,
    ): DeviceStatusResponse

    @POST("streaming/publisher-token")
    suspend fun publisherToken(
        @Header("Authorization") authorization: String,
    ): PublisherTokenResponse

    @GET("device-chats")
    suspend fun chats(
        @Header("Authorization") authorization: String,
    ): List<ChatThreadDto>

    @GET("device-chats/{id}/messages")
    suspend fun chatMessages(
        @Header("Authorization") authorization: String,
        @retrofit2.http.Path("id") id: String,
        @retrofit2.http.Query("cursor") cursor: String? = null,
    ): ChatMessagesPage

    @POST("device-chats/{id}/messages")
    suspend fun sendChat(
        @Header("Authorization") authorization: String,
        @retrofit2.http.Path("id") id: String,
        @Body body: SendChatRequest,
    ): ChatMessageDto

    @POST("device-chats/{id}/read")
    suspend fun readChat(
        @Header("Authorization") authorization: String,
        @retrofit2.http.Path("id") id: String,
    ): OkResponse

    @GET("device-subscriptions/me")
    suspend fun subscription(
        @Header("Authorization") authorization: String,
    ): SubscriptionDto
}
