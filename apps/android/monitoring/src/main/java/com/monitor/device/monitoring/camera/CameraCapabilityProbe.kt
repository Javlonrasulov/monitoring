package com.monitor.device.monitoring.camera

import android.content.Context
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.util.Size

/**
 * Discovers cameras via Camera2 capability APIs.
 * Does NOT hardcode device models — selection is capability-based.
 */
class CameraCapabilityProbe(context: Context) {
    private val cameraManager =
        context.applicationContext.getSystemService(Context.CAMERA_SERVICE) as CameraManager

    data class CameraInfo(
        val cameraId: String,
        val lensFacing: LensFacing,
        val supportedSizes: List<Size>,
        val hasFlash: Boolean,
        val hardwareLevel: String,
    )

    enum class LensFacing {
        FRONT,
        BACK,
        EXTERNAL,
        UNKNOWN,
    }

    fun discoverCameras(): List<CameraInfo> {
        return cameraManager.cameraIdList.mapNotNull { id ->
            runCatching {
                val chars = cameraManager.getCameraCharacteristics(id)
                val facing = when (chars.get(CameraCharacteristics.LENS_FACING)) {
                    CameraCharacteristics.LENS_FACING_FRONT -> LensFacing.FRONT
                    CameraCharacteristics.LENS_FACING_BACK -> LensFacing.BACK
                    CameraCharacteristics.LENS_FACING_EXTERNAL -> LensFacing.EXTERNAL
                    else -> LensFacing.UNKNOWN
                }
                val map = chars.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
                val sizes = map?.getOutputSizes(android.graphics.ImageFormat.YUV_420_888)
                    ?.toList()
                    .orEmpty()
                val flash = chars.get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
                val level = when (chars.get(CameraCharacteristics.INFO_SUPPORTED_HARDWARE_LEVEL)) {
                    CameraCharacteristics.INFO_SUPPORTED_HARDWARE_LEVEL_LEGACY -> "LEGACY"
                    CameraCharacteristics.INFO_SUPPORTED_HARDWARE_LEVEL_LIMITED -> "LIMITED"
                    CameraCharacteristics.INFO_SUPPORTED_HARDWARE_LEVEL_FULL -> "FULL"
                    CameraCharacteristics.INFO_SUPPORTED_HARDWARE_LEVEL_3 -> "LEVEL_3"
                    else -> "UNKNOWN"
                }
                CameraInfo(
                    cameraId = id,
                    lensFacing = facing,
                    supportedSizes = sizes,
                    hasFlash = flash,
                    hardwareLevel = level,
                )
            }.getOrNull()
        }
    }

    /**
     * Prefers back camera with the largest supported YUV size under [maxWidth]x[maxHeight].
     */
    fun selectBestCamera(
        preferFacing: LensFacing = LensFacing.BACK,
        maxWidth: Int = 1920,
        maxHeight: Int = 1080,
    ): CameraInfo? {
        val cameras = discoverCameras()
        val preferred = cameras.filter { it.lensFacing == preferFacing }.ifEmpty { cameras }
        return preferred.maxByOrNull { cam ->
            cam.supportedSizes
                .filter { it.width <= maxWidth && it.height <= maxHeight }
                .maxOfOrNull { it.width.toLong() * it.height }
                ?: 0L
        }
    }
}
