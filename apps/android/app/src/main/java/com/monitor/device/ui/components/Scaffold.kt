package com.monitor.device.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.monitor.device.ui.theme.MonitorTheme
import com.monitor.device.ui.theme.Sizing
import com.monitor.device.ui.theme.Spacing

/**
 * Root shell for every screen: ambient brand glow, status-bar insets and the
 * shared header are resolved here so individual screens only supply content.
 */
@Composable
fun AppShell(
    modifier: Modifier = Modifier,
    topBar: @Composable (() -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    val colors = MonitorTheme.colors
    val glow = MaterialTheme.colorScheme.primary.copy(alpha = if (colors.isDark) 0.09f else 0.12f)

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        colors = listOf(glow, MaterialTheme.colorScheme.background),
                        endY = 760f,
                    ),
                ),
        )
        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .imePadding(),
        ) {
            if (topBar != null) {
                Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
                    Box(modifier = Modifier.widthIn(max = Sizing.contentMaxWidth)) { topBar() }
                }
            }
            Box(modifier = Modifier.fillMaxSize()) { content() }
        }
    }
}

/**
 * Centers screen content and caps its width so large phones and tablets keep
 * comfortable line lengths. Narrow devices get tighter side padding.
 */
@Composable
fun ScreenContainer(
    modifier: Modifier = Modifier,
    scrollable: Boolean = true,
    verticalArrangement: Arrangement.Vertical = Arrangement.Top,
    horizontalAlignment: Alignment.Horizontal = Alignment.Start,
    content: @Composable ColumnScope.() -> Unit,
) {
    BoxWithConstraints(modifier = modifier.fillMaxSize()) {
        val horizontal = if (maxWidth < 360.dp) Spacing.md else Spacing.lg
        // A scrolling column reports its content height, which would defeat
        // Center/Bottom arrangements; pin it to at least the viewport height.
        val heightModifier = if (scrollable) {
            Modifier
                .verticalScroll(rememberScrollState())
                .heightIn(min = maxHeight)
        } else {
            Modifier.fillMaxHeight()
        }
        Column(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .widthIn(max = Sizing.contentMaxWidth)
                .fillMaxWidth()
                .then(heightModifier)
                .padding(horizontal = horizontal),
            verticalArrangement = verticalArrangement,
            horizontalAlignment = horizontalAlignment,
            content = content,
        )
    }
}

/** App header: brand identity on the left, quick actions on the right. */
@Composable
fun MonitorTopBar(
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    showBrand: Boolean = true,
    actions: @Composable RowScope.() -> Unit = {},
) {
    val colors = MonitorTheme.colors
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg, vertical = Spacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
    ) {
        if (showBrand) {
            BrandMark(size = 38.dp)
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleLarge,
                color = colors.textPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (subtitle != null) {
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.textMuted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        actions()
    }
}
