package com.monitor.device.monitoring.stream

/**
 * Stream quality presets for video publishing.
 */
enum class StreamQuality(
    val width: Int,
    val height: Int,
    val targetBitrateBps: Int,
    val maxBitrateBps: Int,
    val fps: Int,
) {
    LOW(640, 360, 400_000, 600_000, 15),
    MEDIUM(1280, 720, 1_200_000, 1_800_000, 24),
    HIGH(1920, 1080, 2_500_000, 3_500_000, 30),
}
