package com.monitor.device.monitoring.reconnect

import android.util.Log
import kotlin.math.min
import kotlinx.coroutines.delay

/**
 * Exponential backoff helper for reconnect / republish attempts.
 */
class ReconnectManager(
    private val initialDelayMs: Long = 1_000L,
    private val maxDelayMs: Long = 60_000L,
    private val multiplier: Double = 2.0,
) {
    private var attempt = 0

    fun reset() {
        attempt = 0
    }

    fun nextDelayMs(): Long {
        val exp = initialDelayMs * Math.pow(multiplier, attempt.toDouble()).toLong()
        attempt += 1
        return min(maxDelayMs, exp)
    }

    suspend fun awaitNext(reason: String = "retry") {
        val delayMs = nextDelayMs()
        Log.i(TAG, "Backoff #$attempt for $reason → ${delayMs}ms")
        delay(delayMs)
    }

    companion object {
        private const val TAG = "ReconnectManager"
    }
}
