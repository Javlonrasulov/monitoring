package com.monitor.device.core.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

@Serializable
data class PairRequest(
    val code: String,
    val name: String,
    val capabilities: JsonObject? = null,
    val appVersion: String? = null,
    val androidVersion: String? = null,
    val deviceModel: String? = null,
)

@Serializable
data class PairResponse(
    val deviceId: String,
    val name: String,
    val organizationId: String,
    val branchId: String,
    val deviceToken: String,
    val apiKey: String,
)

@Serializable
data class DeviceStatusUpdate(
    val status: String? = null,
    val batteryPercent: Int? = null,
    val charging: Boolean? = null,
    val batterySaver: Boolean? = null,
    val thermalState: String? = null,
    val networkType: String? = null,
    val networkQuality: Int? = null,
    val errorCode: String? = null,
    val errorMessage: String? = null,
    val appVersion: String? = null,
    val androidVersion: String? = null,
    val deviceModel: String? = null,
    val capabilities: JsonObject? = null,
)

@Serializable
data class DeviceStatusResponse(
    val id: String? = null,
    val status: String? = null,
    val batteryPercent: Int? = null,
    val charging: Boolean? = null,
    val cameraFacing: String? = null,
)

@Serializable
data class DeviceMeResponse(
    val id: String? = null,
    val status: String? = null,
    val cameraFacing: String? = null,
)

enum class CameraFacing {
    FRONT,
    BACK,
    ;

    companion object {
        fun from(value: String?): CameraFacing? = when (value?.uppercase()) {
            "FRONT" -> FRONT
            "BACK" -> BACK
            else -> null
        }
    }
}

@Serializable
data class PublisherTokenResponse(
    val token: String,
    val expiresIn: Int,
    val path: String,
    val whipUrl: String,
    val sessionId: String,
)

enum class ConnectionStatus {
    ONLINE,
    OFFLINE,
    CONNECTING,
    STREAMING,
    ERROR,
}

enum class NetworkTypeLabel {
    WIFI,
    MOBILE,
    UNKNOWN,
}
