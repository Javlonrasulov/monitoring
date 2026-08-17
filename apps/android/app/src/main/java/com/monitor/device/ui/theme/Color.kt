package com.monitor.device.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * Monitor brand palette. Teal identity carried from the launcher icon,
 * paired with cool slate neutrals for a calm, security-grade feel.
 */
object BrandPalette {
    val Teal900 = Color(0xFF042F2E)
    val Teal800 = Color(0xFF115E59)
    val Teal700 = Color(0xFF0F766E)
    val Teal600 = Color(0xFF0D9488)
    val Teal500 = Color(0xFF14B8A6)
    val Teal400 = Color(0xFF2DD4BF)
    val Teal300 = Color(0xFF5EEAD4)

    val Success = Color(0xFF10B981)
    val SuccessDark = Color(0xFF34D399)
    val Warning = Color(0xFFF59E0B)
    val WarningDark = Color(0xFFFBBF24)
    val Danger = Color(0xFFE11D48)
    val DangerDark = Color(0xFFFB7185)
    val Info = Color(0xFF3B82F6)
    val InfoDark = Color(0xFF60A5FA)
}

/** Light surfaces: bright, clean, high legibility. */
object LightPalette {
    val Background = Color(0xFFF4F7F7)
    val Surface = Color(0xFFFFFFFF)
    val SurfaceElevated = Color(0xFFFFFFFF)
    val SurfaceMuted = Color(0xFFEDF2F2)
    val Text = Color(0xFF0A1615)
    val TextSecondary = Color(0xFF445B59)
    val TextMuted = Color(0xFF6D8482)
    val Border = Color(0x140F766E)
    val BorderStrong = Color(0x2E0F766E)
    val Scrim = Color(0x660A1615)
}

/** Dark surfaces: deep and layered, restrained contrast, no neon washes. */
object DarkPalette {
    val Background = Color(0xFF060E0E)
    val Surface = Color(0xFF0E1A19)
    val SurfaceElevated = Color(0xFF152524)
    val SurfaceMuted = Color(0xFF192C2A)
    val Text = Color(0xFFEAF4F2)
    val TextSecondary = Color(0xFFA9C2BF)
    val TextMuted = Color(0xFF7E9B98)
    val Border = Color(0x1F2DD4BF)
    val BorderStrong = Color(0x3D2DD4BF)
    val Scrim = Color(0xAA02100F)
}
