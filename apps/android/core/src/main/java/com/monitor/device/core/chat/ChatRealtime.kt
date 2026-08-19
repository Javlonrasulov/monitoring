package com.monitor.device.core.chat

import com.monitor.device.core.auth.TokenStore
import com.monitor.device.core.model.ChatMessageDto
import io.socket.client.IO
import io.socket.client.Socket
import kotlinx.serialization.json.Json
import org.json.JSONObject
import java.net.URI

class ChatRealtime(
    apiBaseUrl: String,
    private val tokenStore: TokenStore,
) {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }
    private val origin: String = apiBaseUrl.trimEnd('/').removeSuffix("/api/v1")
    private var socket: Socket? = null

    fun connect(onEvent: (String, String) -> Unit) {
        disconnect()
        val token = tokenStore.deviceToken() ?: return
        val options = IO.Options().apply {
            auth = mapOf("token" to token)
            transports = arrayOf("websocket", "polling")
            reconnection = true
            forceNew = true
        }
        val next = IO.socket(URI.create("$origin/chat"), options)
        listOf(
            "chat.message",
            "chat.message.updated",
            "chat.message.deleted",
            "chat.read",
            "chat.typing",
            "chat.presence",
        ).forEach { event ->
            next.on(event) { args ->
                val payload = args.firstOrNull()?.toString().orEmpty()
                onEvent(event, payload)
            }
        }
        next.connect()
        socket = next
    }

    fun emitTyping(threadId: String, typing: Boolean) {
        val payload = JSONObject()
            .put("threadId", threadId)
            .put("typing", typing)
        socket?.emit("chat.typing", payload)
    }

    fun decodeMessage(raw: String): ChatMessageDto? {
        return runCatching {
            val obj = JSONObject(raw)
            val message = obj.optJSONObject("message") ?: obj
            json.decodeFromString(ChatMessageDto.serializer(), message.toString())
        }.getOrNull()
    }

    fun disconnect() {
        socket?.off()
        socket?.disconnect()
        socket = null
    }
}
