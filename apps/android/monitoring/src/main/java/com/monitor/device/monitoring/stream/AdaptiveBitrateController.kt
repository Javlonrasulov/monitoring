package com.monitor.device.monitoring.stream

import android.util.Log
import kotlin.math.max
import kotlin.math.min

/**
 * Simple adaptive bitrate controller that reacts to network quality and thermal pressure.
 */
class AdaptiveBitrateController(
    initial: StreamQuality = StreamQuality.MEDIUM,
) {
    @Volatile
    var quality: StreamQuality = initial
        private set

    @Volatile
    var currentBitrateBps: Int = initial.targetBitrateBps
        private set

    fun onNetworkQuality(qualityScore0to100: Int, thermalHot: Boolean) {
        val target = when {
            thermalHot -> StreamQuality.LOW
            qualityScore0to100 >= 75 -> StreamQuality.HIGH
            qualityScore0to100 >= 40 -> StreamQuality.MEDIUM
            else -> StreamQuality.LOW
        }
        if (target != quality) {
            quality = target
            currentBitrateBps = target.targetBitrateBps
            Log.i(TAG, "Quality preset → $target")
            return
        }

        val factor = when {
            thermalHot -> 0.6
            qualityScore0to100 >= 80 -> 1.1
            qualityScore0to100 >= 50 -> 1.0
            else -> 0.75
        }
        currentBitrateBps = min(
            target.maxBitrateBps,
            max(target.targetBitrateBps / 2, (currentBitrateBps * factor).toInt()),
        )
    }

    fun reset(to: StreamQuality = StreamQuality.MEDIUM) {
        quality = to
        currentBitrateBps = to.targetBitrateBps
    }

    companion object {
        private const val TAG = "AdaptiveBitrate"
    }
}
