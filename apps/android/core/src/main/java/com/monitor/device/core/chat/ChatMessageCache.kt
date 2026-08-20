package com.monitor.device.core.chat

import android.content.Context
import com.monitor.device.core.model.ChatMessageDto
import com.monitor.device.core.model.ChatMessagesPage
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json

/**
 * Last-known messages per thread so reopening a chat is not blank while the
 * network refresh runs (or if the first request fails).
 */
class ChatMessageCache(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        encodeDefaults = true
        coerceInputValues = true
    }

    fun load(threadId: String): List<ChatMessageDto> {
        val raw = prefs.getString(key(threadId), null) ?: return emptyList()
        return runCatching {
            json.decodeFromString(ListSerializer(ChatMessageDto.serializer()), raw)
        }.getOrDefault(emptyList())
    }

    fun save(threadId: String, messages: List<ChatMessageDto>) {
        val durable = messages
            .filterNot { it.localStatus == "sending" || it.localStatus == "failed" }
            .takeLast(MAX_MESSAGES)
        if (durable.isEmpty()) {
            prefs.edit().remove(key(threadId)).apply()
            return
        }
        val raw = json.encodeToString(ListSerializer(ChatMessageDto.serializer()), durable)
        prefs.edit().putString(key(threadId), raw).apply()
    }

    fun mergePage(threadId: String, page: ChatMessagesPage): List<ChatMessageDto> {
        val merged = (page.items + load(threadId))
            .distinctBy { it.id }
            .sortedBy { it.createdAt }
        save(threadId, merged)
        return merged
    }

    private fun key(threadId: String) = "thread_$threadId"

    companion object {
        private const val PREFS = "chat_message_cache"
        private const val MAX_MESSAGES = 200
    }
}
