package com.monitor.device.ui.components

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.dp
import com.monitor.device.ui.theme.Spacing

/** Pulsing dot that signals an ongoing live capture. */
@Composable
fun LiveDot(
    color: Color,
    modifier: Modifier = Modifier,
    animated: Boolean = true,
    size: androidx.compose.ui.unit.Dp = 8.dp,
) {
    val transition = rememberInfiniteTransition(label = "liveDot")
    val scale by transition.animateFloat(
        initialValue = 1f,
        targetValue = if (animated) 2.4f else 1f,
        animationSpec = infiniteRepeatable(tween(1400), RepeatMode.Restart),
        label = "dotScale",
    )
    val alpha by transition.animateFloat(
        initialValue = if (animated) 0.5f else 0f,
        targetValue = 0f,
        animationSpec = infiniteRepeatable(tween(1400), RepeatMode.Restart),
        label = "dotAlpha",
    )

    Box(modifier = modifier.size(size * 2.6f), contentAlignment = Alignment.Center) {
        if (animated) {
            Box(
                modifier = Modifier
                    .size(size)
                    .graphicsLayer {
                        scaleX = scale
                        scaleY = scale
                        this.alpha = alpha
                    }
                    .background(color, CircleShape),
            )
        }
        Box(modifier = Modifier.size(size).background(color, CircleShape))
    }
}

/** Compact pill communicating a state, optionally with a live indicator. */
@Composable
fun StatusBadge(
    text: String,
    color: Color,
    modifier: Modifier = Modifier,
    animated: Boolean = false,
    onDark: Boolean = false,
) {
    val container = if (onDark) Color.White.copy(alpha = 0.16f) else color.copy(alpha = 0.12f)
    val outline = if (onDark) Color.White.copy(alpha = 0.24f) else color.copy(alpha = 0.22f)
    val label = if (onDark) Color.White else color

    Row(
        modifier = modifier
            .background(container, RoundedCornerShape(999.dp))
            .border(1.dp, outline, RoundedCornerShape(999.dp))
            .padding(start = Spacing.xs, end = Spacing.sm, top = 5.dp, bottom = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        LiveDot(color = label, animated = animated, size = 6.dp)
        Text(
            text = text,
            style = MaterialTheme.typography.labelSmall,
            color = label,
        )
    }
}
