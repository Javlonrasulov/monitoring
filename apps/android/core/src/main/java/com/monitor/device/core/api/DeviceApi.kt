package com.monitor.device.core.api

import com.monitor.device.core.model.DeviceMeResponse
import com.monitor.device.core.model.DeviceStatusResponse
import com.monitor.device.core.model.DeviceStatusUpdate
import com.monitor.device.core.model.PairRequest
import com.monitor.device.core.model.PairResponse
import com.monitor.device.core.model.PublisherTokenResponse
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
}
