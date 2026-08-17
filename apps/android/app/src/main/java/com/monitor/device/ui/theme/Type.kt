package com.monitor.device.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.unit.sp

private val Sans = FontFamily.SansSerif

private val TrimmedLineHeight = LineHeightStyle(
    alignment = LineHeightStyle.Alignment.Center,
    trim = LineHeightStyle.Trim.None,
)

private fun style(
    size: Int,
    lineHeight: Int,
    weight: FontWeight,
    tracking: Double = 0.0,
) = TextStyle(
    fontFamily = Sans,
    fontSize = size.sp,
    lineHeight = lineHeight.sp,
    fontWeight = weight,
    letterSpacing = tracking.sp,
    lineHeightStyle = TrimmedLineHeight,
)

val MonitorTypography = Typography(
    displaySmall = style(32, 40, FontWeight.ExtraBold, -0.8),
    headlineLarge = style(28, 36, FontWeight.ExtraBold, -0.6),
    headlineMedium = style(24, 32, FontWeight.Bold, -0.4),
    headlineSmall = style(20, 28, FontWeight.Bold, -0.2),
    titleLarge = style(18, 26, FontWeight.Bold, -0.1),
    titleMedium = style(16, 24, FontWeight.SemiBold),
    titleSmall = style(14, 20, FontWeight.SemiBold),
    bodyLarge = style(15, 24, FontWeight.Normal),
    bodyMedium = style(14, 22, FontWeight.Normal),
    bodySmall = style(13, 20, FontWeight.Normal),
    labelLarge = style(15, 20, FontWeight.SemiBold, 0.1),
    labelMedium = style(13, 18, FontWeight.SemiBold, 0.2),
    labelSmall = style(11, 16, FontWeight.Bold, 0.6),
)
