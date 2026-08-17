package com.monitor.device.ui.theme

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

/**
 * Tokens Material3 does not model but the Monitor UI relies on:
 * status colors, muted text tiers, borders and brand gradients.
 */
@Immutable
data class MonitorColors(
    val isDark: Boolean,
    val surfaceElevated: Color,
    val surfaceMuted: Color,
    val textPrimary: Color,
    val textSecondary: Color,
    val textMuted: Color,
    val border: Color,
    val borderStrong: Color,
    val success: Color,
    val warning: Color,
    val danger: Color,
    val info: Color,
    val scrim: Color,
    val brandGradient: Brush,
    val heroGradient: Brush,
    /** Fill for destructive buttons; kept dark enough for white labels. */
    val dangerGradient: Brush,
    val shimmer: List<Color>,
)

private val DangerFill = Brush.linearGradient(
    listOf(Color(0xFFE11D48), Color(0xFFBE123C)),
)

private val LightMonitorColors = MonitorColors(
    isDark = false,
    surfaceElevated = LightPalette.SurfaceElevated,
    surfaceMuted = LightPalette.SurfaceMuted,
    textPrimary = LightPalette.Text,
    textSecondary = LightPalette.TextSecondary,
    textMuted = LightPalette.TextMuted,
    border = LightPalette.Border,
    borderStrong = LightPalette.BorderStrong,
    success = BrandPalette.Success,
    warning = BrandPalette.Warning,
    danger = BrandPalette.Danger,
    info = BrandPalette.Info,
    scrim = LightPalette.Scrim,
    brandGradient = Brush.linearGradient(
        listOf(BrandPalette.Teal600, BrandPalette.Teal700),
    ),
    heroGradient = Brush.linearGradient(
        listOf(BrandPalette.Teal600, BrandPalette.Teal700, BrandPalette.Teal800),
    ),
    dangerGradient = DangerFill,
    shimmer = listOf(
        LightPalette.SurfaceMuted,
        Color(0xFFF7FAFA),
        LightPalette.SurfaceMuted,
    ),
)

private val DarkMonitorColors = MonitorColors(
    isDark = true,
    surfaceElevated = DarkPalette.SurfaceElevated,
    surfaceMuted = DarkPalette.SurfaceMuted,
    textPrimary = DarkPalette.Text,
    textSecondary = DarkPalette.TextSecondary,
    textMuted = DarkPalette.TextMuted,
    border = DarkPalette.Border,
    borderStrong = DarkPalette.BorderStrong,
    success = BrandPalette.SuccessDark,
    warning = BrandPalette.WarningDark,
    danger = BrandPalette.DangerDark,
    info = BrandPalette.InfoDark,
    scrim = DarkPalette.Scrim,
    brandGradient = Brush.linearGradient(
        listOf(BrandPalette.Teal600, BrandPalette.Teal800),
    ),
    heroGradient = Brush.linearGradient(
        listOf(BrandPalette.Teal700, BrandPalette.Teal800, BrandPalette.Teal900),
    ),
    dangerGradient = DangerFill,
    shimmer = listOf(
        DarkPalette.SurfaceMuted,
        Color(0xFF203735),
        DarkPalette.SurfaceMuted,
    ),
)

private val LightScheme = lightColorScheme(
    primary = BrandPalette.Teal700,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFD6F2EE),
    onPrimaryContainer = BrandPalette.Teal900,
    secondary = BrandPalette.Teal600,
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFE3F5F2),
    onSecondaryContainer = BrandPalette.Teal900,
    tertiary = BrandPalette.Info,
    onTertiary = Color.White,
    background = LightPalette.Background,
    onBackground = LightPalette.Text,
    surface = LightPalette.Surface,
    onSurface = LightPalette.Text,
    surfaceVariant = LightPalette.SurfaceMuted,
    onSurfaceVariant = LightPalette.TextSecondary,
    outline = LightPalette.BorderStrong,
    outlineVariant = LightPalette.Border,
    error = BrandPalette.Danger,
    onError = Color.White,
    errorContainer = Color(0xFFFFE4E9),
    onErrorContainer = Color(0xFF7F1030),
    scrim = LightPalette.Scrim,
)

private val DarkScheme = darkColorScheme(
    primary = BrandPalette.Teal400,
    onPrimary = BrandPalette.Teal900,
    primaryContainer = Color(0xFF11332F),
    onPrimaryContainer = BrandPalette.Teal300,
    secondary = BrandPalette.Teal500,
    onSecondary = BrandPalette.Teal900,
    secondaryContainer = Color(0xFF102E2B),
    onSecondaryContainer = BrandPalette.Teal300,
    tertiary = BrandPalette.InfoDark,
    onTertiary = Color(0xFF06203F),
    background = DarkPalette.Background,
    onBackground = DarkPalette.Text,
    surface = DarkPalette.Surface,
    onSurface = DarkPalette.Text,
    surfaceVariant = DarkPalette.SurfaceMuted,
    onSurfaceVariant = DarkPalette.TextSecondary,
    outline = DarkPalette.BorderStrong,
    outlineVariant = DarkPalette.Border,
    error = BrandPalette.DangerDark,
    onError = Color(0xFF450A18),
    errorContainer = Color(0xFF3D1220),
    onErrorContainer = Color(0xFFFFD3DB),
    scrim = DarkPalette.Scrim,
)

val LocalMonitorColors = staticCompositionLocalOf { LightMonitorColors }

/** Shorthand: `MonitorTheme.colors.textMuted`. */
object MonitorTheme {
    val colors: MonitorColors
        @Composable get() = LocalMonitorColors.current
}

@Composable
fun MonitorTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val target = if (darkTheme) DarkScheme else LightScheme
    val spec = tween<Color>(durationMillis = 320)

    // Animating the large surfaces keeps light/dark switching from flashing.
    val scheme = target.copy(
        background = animateColorAsState(target.background, spec, label = "bg").value,
        surface = animateColorAsState(target.surface, spec, label = "surface").value,
        onBackground = animateColorAsState(target.onBackground, spec, label = "onBg").value,
        onSurface = animateColorAsState(target.onSurface, spec, label = "onSurface").value,
        surfaceVariant = animateColorAsState(target.surfaceVariant, spec, label = "surfaceVar").value,
    )

    CompositionLocalProvider(
        LocalMonitorColors provides if (darkTheme) DarkMonitorColors else LightMonitorColors,
    ) {
        MaterialTheme(
            colorScheme = scheme,
            typography = MonitorTypography,
            shapes = MonitorShapes,
            content = content,
        )
    }
}
