package com.monitor.device.ui.navigation

import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.DarkMode
import androidx.compose.material.icons.rounded.LightMode
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.monitor.device.R
import com.monitor.device.core.api.DeviceApiClient
import com.monitor.device.core.auth.TokenStore
import com.monitor.device.monitoring.service.MonitoringForegroundService
import com.monitor.device.settings.AppLanguage
import com.monitor.device.settings.AppSettings
import com.monitor.device.settings.ThemeMode
import com.monitor.device.ui.components.AppShell
import com.monitor.device.ui.components.IconPillButton
import com.monitor.device.ui.components.MonitorTopBar
import com.monitor.device.ui.components.SettingsSheet
import com.monitor.device.ui.screens.HomeScreen
import com.monitor.device.ui.screens.PairingScreen
import com.monitor.device.ui.screens.PermissionsScreen
import com.monitor.device.ui.screens.hasCapturePermissions

object Routes {
    const val Permissions = "permissions"
    const val Pairing = "pairing"
    const val Home = "home"
}

private const val TransitionMillis = 300

@Composable
fun MonitorNavHost(
    tokenStore: TokenStore,
    apiClient: DeviceApiClient,
    themeMode: ThemeMode,
    isDarkTheme: Boolean,
    onThemeChange: (ThemeMode) -> Unit,
    onLanguageChange: (AppLanguage) -> Unit,
) {
    val context = LocalContext.current
    val navController = rememberNavController()
    val start = remember {
        when {
            tokenStore.isPaired() && hasCapturePermissions(context) -> Routes.Home
            else -> Routes.Permissions
        }
    }

    var showSettings by remember { mutableStateOf(false) }
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.route ?: start
    val showTopBar = currentRoute != Routes.Permissions

    AppShell(
        topBar = if (!showTopBar) {
            null
        } else {
            {
                MonitorTopBar(
                    title = stringResource(R.string.app_name),
                    subtitle = stringResource(R.string.brand_tagline),
                    actions = {
                        IconPillButton(
                            icon = if (isDarkTheme) Icons.Rounded.LightMode else Icons.Rounded.DarkMode,
                            contentDescription = stringResource(R.string.cd_change_theme),
                            onClick = {
                                onThemeChange(if (isDarkTheme) ThemeMode.LIGHT else ThemeMode.DARK)
                            },
                        )
                        IconPillButton(
                            icon = Icons.Rounded.Tune,
                            contentDescription = stringResource(R.string.settings_language),
                            onClick = { showSettings = true },
                        )
                    },
                )
            }
        },
    ) {
        NavHost(
            navController = navController,
            startDestination = start,
            enterTransition = { forwardEnter() },
            exitTransition = { forwardExit() },
            popEnterTransition = { backEnter() },
            popExitTransition = { backExit() },
        ) {
            composable(Routes.Permissions) {
                PermissionsScreen(
                    onAllGranted = {
                        if (tokenStore.isPaired()) {
                            navController.navigate(Routes.Home) {
                                popUpTo(Routes.Permissions) { inclusive = true }
                            }
                        } else {
                            navController.navigate(Routes.Pairing) {
                                popUpTo(Routes.Permissions) { inclusive = false }
                            }
                        }
                    },
                )
            }
            composable(Routes.Pairing) {
                PairingScreen(
                    apiClient = apiClient,
                    onPaired = {
                        navController.navigate(Routes.Home) {
                            popUpTo(Routes.Permissions) { inclusive = true }
                        }
                    },
                )
            }
            composable(Routes.Home) {
                HomeScreen(
                    tokenStore = tokenStore,
                    onUnpaired = {
                        MonitoringForegroundService.stop(context)
                        tokenStore.clear()
                        navController.navigate(Routes.Permissions) {
                            popUpTo(Routes.Home) { inclusive = true }
                        }
                    },
                    onPermissionsRequired = {
                        navController.navigate(Routes.Permissions) {
                            popUpTo(Routes.Home) { inclusive = true }
                        }
                    },
                )
            }
        }
    }

    if (showSettings) {
        SettingsSheet(
            themeMode = themeMode,
            language = AppSettings.language(context),
            onThemeChange = onThemeChange,
            onLanguageChange = { language ->
                showSettings = false
                onLanguageChange(language)
            },
            onDismiss = { showSettings = false },
        )
    }
}

private fun AnimatedContentTransitionScope<*>.forwardEnter() =
    slideInHorizontally(tween(TransitionMillis, easing = FastOutSlowInEasing)) { it / 5 } +
        fadeIn(tween(TransitionMillis))

private fun AnimatedContentTransitionScope<*>.forwardExit() =
    slideOutHorizontally(tween(TransitionMillis, easing = FastOutSlowInEasing)) { -it / 6 } +
        fadeOut(tween(TransitionMillis / 2))

private fun AnimatedContentTransitionScope<*>.backEnter() =
    slideInHorizontally(tween(TransitionMillis, easing = FastOutSlowInEasing)) { -it / 5 } +
        fadeIn(tween(TransitionMillis))

private fun AnimatedContentTransitionScope<*>.backExit() =
    slideOutHorizontally(tween(TransitionMillis, easing = FastOutSlowInEasing)) { it / 6 } +
        fadeOut(tween(TransitionMillis / 2))
