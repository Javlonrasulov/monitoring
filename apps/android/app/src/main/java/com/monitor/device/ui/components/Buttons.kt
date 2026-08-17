package com.monitor.device.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.ripple.rememberRipple
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.monitor.device.ui.theme.MonitorTheme
import com.monitor.device.ui.theme.Sizing
import com.monitor.device.ui.theme.Spacing

private val ButtonShape = RoundedCornerShape(18.dp)

/** Shared press-scale feedback so every tappable surface reacts the same way. */
@Composable
private fun Modifier.pressScale(pressed: Boolean, scale: Float = 0.97f): Modifier {
    val animated by animateFloatAsState(
        targetValue = if (pressed) scale else 1f,
        animationSpec = spring(dampingRatio = 0.6f),
        label = "pressScale",
    )
    return graphicsLayer {
        scaleX = animated
        scaleY = animated
    }
}

@Composable
private fun ButtonSurface(
    onClick: () -> Unit,
    enabled: Boolean,
    background: Brush,
    contentColor: Color,
    modifier: Modifier = Modifier,
    border: BorderStroke? = null,
    content: @Composable () -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()

    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(Sizing.buttonHeight)
            .pressScale(pressed)
            .alpha(if (enabled) 1f else 0.45f)
            .clip(ButtonShape)
            .background(background, ButtonShape)
            .then(if (border != null) Modifier.border(border, ButtonShape) else Modifier)
            .clickable(
                enabled = enabled,
                interactionSource = interaction,
                indication = rememberRipple(color = contentColor),
                onClick = onClick,
            )
            .padding(horizontal = Spacing.lg),
        contentAlignment = Alignment.Center,
    ) {
        content()
    }
}

@Composable
private fun ButtonLabel(
    text: String,
    color: Color,
    icon: ImageVector?,
) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(Spacing.xs, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon != null) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = color,
                modifier = Modifier.size(Sizing.iconMd),
            )
        }
        Text(
            text = text,
            style = MaterialTheme.typography.labelLarge,
            color = color,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Center,
        )
    }
}

/** Highest-emphasis action. One per screen. */
@Composable
fun PrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    loading: Boolean = false,
    icon: ImageVector? = null,
) {
    val colors = MonitorTheme.colors
    ButtonSurface(
        onClick = onClick,
        enabled = enabled && !loading,
        background = colors.brandGradient,
        contentColor = Color.White,
        modifier = modifier,
    ) {
        if (loading) {
            CircularProgressIndicator(
                color = Color.White,
                strokeWidth = 2.dp,
                modifier = Modifier.size(22.dp),
            )
        } else {
            ButtonLabel(text, Color.White, icon)
        }
    }
}

/** Destructive primary action, e.g. stopping a live capture. */
@Composable
fun DangerButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    icon: ImageVector? = null,
) {
    val colors = MonitorTheme.colors
    ButtonSurface(
        onClick = onClick,
        enabled = enabled,
        background = colors.dangerGradient,
        contentColor = Color.White,
        modifier = modifier,
    ) {
        ButtonLabel(text, Color.White, icon)
    }
}

/** Neutral, lower-emphasis action that still reads as a real button. */
@Composable
fun SecondaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    icon: ImageVector? = null,
    contentColor: Color = MonitorTheme.colors.textSecondary,
) {
    val colors = MonitorTheme.colors
    ButtonSurface(
        onClick = onClick,
        enabled = enabled,
        background = SolidColor(colors.surfaceMuted),
        contentColor = contentColor,
        border = BorderStroke(1.dp, colors.border),
        modifier = modifier,
    ) {
        ButtonLabel(text, contentColor, icon)
    }
}

/** Compact circular icon action used in headers. */
@Composable
fun IconPillButton(
    icon: ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = MonitorTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()

    Box(
        modifier = modifier
            .size(Sizing.iconButton)
            .pressScale(pressed, scale = 0.9f)
            .clip(RoundedCornerShape(14.dp))
            .background(colors.surfaceMuted, RoundedCornerShape(14.dp))
            .border(1.dp, colors.border, RoundedCornerShape(14.dp))
            .clickable(
                interactionSource = interaction,
                indication = rememberRipple(bounded = true, color = MaterialTheme.colorScheme.primary),
                onClick = onClick,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            tint = colors.textSecondary,
            modifier = Modifier.size(Sizing.iconMd),
        )
    }
}
