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
data class PairStatusResponse(
    val exists: Boolean = false,
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
    val userId: String? = null,
    val name: String? = null,
    val hasAvatar: Boolean = false,
    val avatarUpdatedAt: String? = null,
)

@Serializable
data class UploadAvatarRequest(
    val imageBase64: String,
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
    val email: String? = null,
    val deviceId: String? = null,
    val hasAvatar: Boolean = false,
    val avatarUpdatedAt: String? = null,
)

@Serializable
data class ChatDeviceRef(
    val id: String? = null,
    val name: String? = null,
    val status: String? = null,
    val lastSeen: String? = null,
)

@Serializable
data class ChatThreadDto(
    val id: String,
    val lastMessagePreview: String? = null,
    val lastMessageAt: String? = null,
    val owner: ChatPeer? = null,
    val peer: ChatPeer? = null,
    val device: ChatDeviceRef? = null,
    val viewerUserId: String? = null,
    val unreadCount: Int = 0,
    val counterpartName: String? = null,
    val counterpartUserId: String? = null,
    val counterpartHasAvatar: Boolean = false,
    val counterpartAvatarUpdatedAt: String? = null,
    val online: Boolean = false,
    val lastSeenAt: String? = null,
)

@Serializable
data class ChatReplyDto(
    val id: String? = null,
    val text: String? = null,
    val messageType: String? = null,
    val senderUserId: String? = null,
    val fileName: String? = null,
    val deletedForEveryone: Boolean = false,
)

@Serializable
data class ChatReactionDto(
    val emoji: String,
    val count: Int = 0,
    val mine: Boolean = false,
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
    val editedAt: String? = null,
    val deletedAt: String? = null,
    val deletedForEveryone: Boolean = false,
    val clientId: String? = null,
    val albumId: String? = null,
    val fileName: String? = null,
    val fileSize: Long? = null,
    val mimeType: String? = null,
    val durationMs: Int? = null,
    val width: Int? = null,
    val height: Int? = null,
    val waveform: List<Double>? = null,
    val hasFile: Boolean = false,
    val hasThumbnail: Boolean = false,
    val forwarded: Boolean = false,
    val replyTo: ChatReplyDto? = null,
    val reactions: List<ChatReactionDto> = emptyList(),
    val mine: Boolean = false,
    val localStatus: String? = null,
    val uploadProgress: Float? = null,
)

@Serializable
data class ChatMessagesPage(
    val items: List<ChatMessageDto> = emptyList(),
    val nextCursor: String? = null,
)

@Serializable
data class ChatSearchPage(
    val items: List<ChatMessageDto> = emptyList(),
)

@Serializable
data class ChatMediaCounts(
    val photos: Int = 0,
    val videos: Int = 0,
    val notes: Int = 0,
    val files: Int = 0,
    val voice: Int = 0,
    val links: Int = 0,
)

@Serializable
data class ChatMediaPage(
    val counts: ChatMediaCounts = ChatMediaCounts(),
    val items: List<ChatMessageDto> = emptyList(),
)

@Serializable
data class OkResponse(
    val ok: Boolean? = null,
)

@Serializable
data class SendChatRequest(
    val text: String = "",
    val replyToId: String? = null,
    val clientId: String? = null,
    val forwardedFromId: String? = null,
)

@Serializable
data class EditChatRequest(
    val text: String,
)

@Serializable
data class DeleteChatRequest(
    val forEveryone: Boolean = false,
)

@Serializable
data class ReactChatRequest(
    val emoji: String,
)

@Serializable
data class InitUploadRequest(
    val fileName: String,
    val mimeType: String,
    val fileSize: Long,
    val messageType: String,
    val durationMs: Int? = null,
    val width: Int? = null,
    val height: Int? = null,
    val replyToId: String? = null,
    val clientId: String? = null,
    val albumId: String? = null,
    val waveformJson: String? = null,
    val text: String? = null,
)

@Serializable
data class InitUploadResponse(
    val uploadId: String,
    val chunkSize: Int = 262144,
    val receivedChunks: Int = 0,
)

@Serializable
data class ChunkUploadResponse(
    val ok: Boolean = true,
    val index: Int = 0,
    val receivedChunks: Int = 0,
    val receivedBytes: Long = 0,
    val fileSize: Long = 0,
)

@Serializable
data class SubscriptionDto(
    val id: String? = null,
    val status: String? = null,
    val plan: String? = null,
    val maxDevices: Int? = null,
    val deviceCount: Int? = null,
    val devicesUsed: String? = null,
    val expiresAt: String? = null,
    val startedAt: String? = null,
    val active: Boolean? = null,
    val trial: Boolean? = null,
    val canWatchVideo: Boolean? = null,
    val canWatchAudio: Boolean? = null,
    val canRecordings: Boolean? = null,
    val canLinkTwoApps: Boolean? = null,
    val priceProUsd: Int? = null,
    val priceProPlusUsd: Int? = null,
)

@Serializable
class EmptyJsonBody

@Serializable
data class PairingCodeResponse(
    val id: String? = null,
    val code: String,
    val expiresAt: String? = null,
    val qrPayload: String? = null,
)

@Serializable
data class LinkedDeviceDto(
    val id: String,
    val name: String,
    val status: String? = null,
    val lastSeen: String? = null,
    val deviceModel: String? = null,
)

@Serializable
data class LinkDeviceRequest(
    val code: String,
)

@Serializable
data class PurchasePlanRequest(
    val plan: String,
)

@Serializable
data class ViewerTokenResponse(
    val token: String,
    val expiresIn: Int = 120,
    val path: String? = null,
    val whepUrl: String,
    val audioEnabled: Boolean = false,
    val videoEnabled: Boolean = true,
    val canRecordings: Boolean = false,
)
