package com.monitor.device.core.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

@Serializable
data class PairRequest(
    val code: String = "",
    val name: String = "",
    val phone: String? = null,
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
    val userId: String? = null,
    val threadId: String? = null,
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

@Serializable
data class ChatPeer(
    val id: String? = null,
    val name: String? = null,
    val role: String? = null,
    val lastSeenAt: String? = null,
)

@Serializable
data class ChatThreadDto(
    val id: String,
    val lastMessagePreview: String? = null,
    val lastMessageAt: String? = null,
    val owner: ChatPeer? = null,
    val peer: ChatPeer? = null,
)

@Serializable
data class ChatMessageDto(
    val id: String,
    val threadId: String? = null,
    val senderUserId: String? = null,
    val receiverUserId: String? = null,
    val messageType: String? = null,
    val text: String? = null,
    val attachmentUrl: String? = null,
    val createdAt: String? = null,
    val deliveredAt: String? = null,
    val readAt: String? = null,
)

@Serializable
data class ChatMessagesPage(
    val items: List<ChatMessageDto> = emptyList(),
    val nextCursor: String? = null,
)

@Serializable
data class OkResponse(
    val ok: Boolean? = null,
)

@Serializable
data class SendChatRequest(
    val text: String,
)

@Serializable
data class SubscriptionDto(
    val id: String? = null,
    val status: String? = null,
    val maxDevices: Int? = null,
    val deviceCount: Int? = null,
    val devicesUsed: String? = null,
    val expiresAt: String? = null,
    val active: Boolean? = null,
)
