package com.monitor.device.ui.components

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Circular brand mark: Telegram-style paper plane on blue.
 */
@Composable
fun BrandMark(
    modifier: Modifier = Modifier,
    size: Dp = 64.dp,
    pulsing: Boolean = false,
) {
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
                    .background(Color(0xFF2AABEE), CircleShape),
            )
        }
        Box(
            modifier = Modifier
                .size(size)
                .background(Color(0xFF2AABEE), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.AutoMirrored.Rounded.Send,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(size / 2.1f),
            )
        }
    }
}
