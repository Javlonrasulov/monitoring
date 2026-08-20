package com.monitor.device.core.model

import kotlinx.serialization.KSerializer
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonEncoder
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive

/** Accepts both `[0.2, 0.5]` and `[1, 2]` so one bad waveform cannot blank the whole chat history. */
object WaveformSerializer : KSerializer<List<Double>?> {
    private val listSerializer = ListSerializer(JsonPrimitive.serializer())
    override val descriptor: SerialDescriptor = listSerializer.descriptor

    override fun deserialize(decoder: Decoder): List<Double>? {
        val json = decoder as? JsonDecoder ?: return null
        val element = json.decodeJsonElement()
        if (element is JsonNull) return null
        val array = element as? JsonArray ?: return null
        return array.mapNotNull { item ->
            val primitive = item.jsonPrimitive
            primitive.doubleOrNull ?: primitive.intOrNull?.toDouble()
        }
    }

    override fun serialize(encoder: Encoder, value: List<Double>?) {
        val json = encoder as? JsonEncoder ?: return
        if (value == null) {
            json.encodeJsonElement(JsonNull)
            return
        }
        json.encodeJsonElement(JsonArray(value.map { JsonPrimitive(it) }))
    }
}
