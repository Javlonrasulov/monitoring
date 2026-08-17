package com.monitor.device.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.DarkMode
import androidx.compose.material.icons.rounded.LightMode
import androidx.compose.material.icons.rounded.Palette
import androidx.compose.material.icons.rounded.PhoneAndroid
import androidx.compose.material.icons.rounded.Translate
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.monitor.device.R
import com.monitor.device.settings.AppLanguage
import com.monitor.device.settings.ThemeMode
import com.monitor.device.ui.theme.MonitorTheme
import com.monitor.device.ui.theme.Sizing
import com.monitor.device.ui.theme.Spacing

/** Appearance and language preferences, presented as a bottom sheet. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsSheet(
    themeMode: ThemeMode,
    language: AppLanguage,
    onThemeChange: (ThemeMode) -> Unit,
    onLanguageChange: (AppLanguage) -> Unit,
    onDismiss: () -> Unit,
) {
    val colors = MonitorTheme.colors
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = colors.surfaceElevated,
        scrimColor = colors.scrim,
        dragHandle = {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = Spacing.sm, bottom = Spacing.xs),
                contentAlignment = Alignment.Center,
            ) {
                Box(
                    modifier = Modifier
                        .size(width = 40.dp, height = 4.dp)
                        .clip(RoundedCornerShape(999.dp))
                        .background(colors.borderStrong),
                )
            }
        },
    ) {
        Column(
            modifier = Modifier
                .padding(horizontal = Spacing.lg)
                .padding(bottom = Spacing.lg)
                .navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(Spacing.sm),
        ) {
            SectionHeader(
                title = stringResource(R.string.settings_theme),
                icon = Icons.Rounded.Palette,
            )
            ThemeSelector(selected = themeMode, onSelect = onThemeChange)

            Box(modifier = Modifier.height(Spacing.xs))

            SectionHeader(
                title = stringResource(R.string.settings_language),
                icon = Icons.Rounded.Translate,
            )
            Column(verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                LanguageOption(
                    label = stringResource(R.string.language_uz),
                    caption = "Oʻzbek tili",
                    selected = language == AppLanguage.UZBEK,
                    onClick = { onLanguageChange(AppLanguage.UZBEK) },
                )
                LanguageOption(
                    label = stringResource(R.string.language_ru),
                    caption = "Русский язык",
                    selected = language == AppLanguage.RUSSIAN,
                    onClick = { onLanguageChange(AppLanguage.RUSSIAN) },
                )
                LanguageOption(
                    label = stringResource(R.string.language_en),
                    caption = "English",
                    selected = language == AppLanguage.ENGLISH,
                    onClick = { onLanguageChange(AppLanguage.ENGLISH) },
                )
            }
        }
    }
}

@Composable
private fun ThemeSelector(
    selected: ThemeMode,
    onSelect: (ThemeMode) -> Unit,
) {
    val colors = MonitorTheme.colors
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(colors.surfaceMuted)
            .border(1.dp, colors.border, RoundedCornerShape(18.dp))
            .padding(4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        ThemeSegment(
            modifier = Modifier.weight(1f),
            icon = Icons.Rounded.PhoneAndroid,
            label = stringResource(R.string.theme_system),
            selected = selected == ThemeMode.SYSTEM,
            onClick = { onSelect(ThemeMode.SYSTEM) },
        )
        ThemeSegment(
            modifier = Modifier.weight(1f),
            icon = Icons.Rounded.LightMode,
            label = stringResource(R.string.theme_light),
            selected = selected == ThemeMode.LIGHT,
            onClick = { onSelect(ThemeMode.LIGHT) },
        )
        ThemeSegment(
            modifier = Modifier.weight(1f),
            icon = Icons.Rounded.DarkMode,
            label = stringResource(R.string.theme_dark),
            selected = selected == ThemeMode.DARK,
            onClick = { onSelect(ThemeMode.DARK) },
        )
    }
}

@Composable
private fun ThemeSegment(
    icon: ImageVector,
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = MonitorTheme.colors
    val background by animateColorAsState(
        targetValue = if (selected) colors.surfaceElevated else Color.Transparent,
        animationSpec = tween(200),
        label = "segmentBg",
    )
    val content by animateColorAsState(
        targetValue = if (selected) MaterialTheme.colorScheme.primary else colors.textMuted,
        animationSpec = tween(200),
        label = "segmentFg",
    )

    Column(
        modifier = modifier
            .clip(RoundedCornerShape(14.dp))
            .background(background)
            .clickable(onClick = onClick)
            .padding(vertical = Spacing.sm),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = content,
            modifier = Modifier.size(Sizing.iconMd),
        )
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = content,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun LanguageOption(
    label: String,
    caption: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val colors = MonitorTheme.colors
    val border by animateColorAsState(
        targetValue = if (selected) MaterialTheme.colorScheme.primary else colors.border,
        animationSpec = tween(200),
        label = "langBorder",
    )

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(if (selected) colors.surfaceMuted else Color.Transparent)
            .border(if (selected) 2.dp else 1.dp, border, RoundedCornerShape(18.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = Spacing.md, vertical = Spacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = label,
                style = MaterialTheme.typography.titleSmall,
                color = colors.textPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = caption,
                style = MaterialTheme.typography.bodySmall,
                color = colors.textMuted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        if (selected) {
            Icon(
                imageVector = Icons.Rounded.Check,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(Sizing.iconMd),
            )
        }
    }
}
