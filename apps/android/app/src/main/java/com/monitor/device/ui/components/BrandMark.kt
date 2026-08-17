package com.monitor.device.ui.components

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Videocam
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.monitor.device.ui.theme.MonitorTheme

/**
 * The app's logo tile: a gradient rounded square with the monitoring glyph.
 * When [pulsing] it emits a slow halo, used while the app is preparing.
 */
@Composable
fun BrandMark(
    modifier: Modifier = Modifier,
    size: Dp = 64.dp,
    pulsing: Boolean = false,
) {
    val colors = MonitorTheme.colors
    val transition = rememberInfiniteTransition(label = "brandPulse")
    val haloScale by transition.animateFloat(
        initialValue = 1f,
        targetValue = if (pulsing) 1.45f else 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(1800),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "haloScale",
    )
    val haloAlpha by transition.animateFloat(
        initialValue = if (pulsing) 0.35f else 0f,
        targetValue = 0f,
        animationSpec = infiniteRepeatable(
            animation = tween(1800),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "haloAlpha",
    )

    Box(
        modifier = modifier.size(if (pulsing) size * 1.6f else size),
        contentAlignment = Alignment.Center,
    ) {
        if (pulsing) {
            Box(
                modifier = Modifier
                    .size(size)
                    .graphicsLayer {
                        scaleX = haloScale
                        scaleY = haloScale
                        alpha = haloAlpha
                    }
                    .background(colors.brandGradient, RoundedCornerShape(size / 2.6f)),
            )
        }
        Box(
            modifier = Modifier
                .size(size)
                .background(colors.brandGradient, RoundedCornerShape(size / 3.2f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Rounded.Videocam,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(size / 2f),
            )
        }
    }
}
