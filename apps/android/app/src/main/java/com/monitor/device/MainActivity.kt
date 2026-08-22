package com.monitor.device

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.view.View
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import com.monitor.device.monitoring.service.MonitoringForegroundService
import com.monitor.device.push.PushRegistrar
import com.monitor.device.settings.AppSettings
import com.monitor.device.settings.ThemeMode
import com.monitor.device.ui.navigation.MonitorNavHost
import com.monitor.device.ui.theme.MonitorTheme

class MainActivity : ComponentActivity() {
    override fun attachBaseContext(newBase: Context) {
        super.attachBaseContext(AppSettings.applyLanguage(newBase))
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Emulator.isEmulator) {
            // WebRTC/camera EGL on API 36 emulators blanks Compose (solid black
            // window while the process is still alive). Keep the UI visible.
            MonitoringForegroundService.stop(this)
            window.decorView.setLayerType(View.LAYER_TYPE_SOFTWARE, null)
        }
        enableEdgeToEdge()
        val app = application as MonitorApp
        PushRegistrar.refresh(app.apiClient, app.tokenStore)
        if (!Emulator.isEmulator &&
            app.tokenStore.isPaired() &&
            app.tokenStore.isAutoStartEnabled()
        ) {
            MonitoringForegroundService.ensureStarted(this)
        }

        setContent {
            var themeMode by remember { mutableStateOf(AppSettings.themeMode(this)) }
            val darkTheme = themeMode.resolveDark()
            var openChatThreadId by remember {
                mutableStateOf(intent?.getStringExtra(EXTRA_CHAT_THREAD_ID))
            }

            DisposableEffect(Unit) {
                val listener: (Intent) -> Unit = { next ->
                    openChatThreadId = next.getStringExtra(EXTRA_CHAT_THREAD_ID)
                }
                addOnNewIntentListener(listener)
                onDispose { removeOnNewIntentListener(listener) }
            }

            // Keep status/navigation icon contrast in sync with the in-app theme,
            // which may differ from the system setting.
            DisposableEffect(darkTheme) {
                val transparent = Color.Transparent.toArgb()
                enableEdgeToEdge(
                    statusBarStyle = SystemBarStyle.auto(transparent, transparent) { darkTheme },
                    navigationBarStyle = SystemBarStyle.auto(transparent, transparent) { darkTheme },
                )
                onDispose {}
            }

            MonitorTheme(darkTheme = darkTheme) {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background,
                ) {
                    MonitorNavHost(
                        tokenStore = app.tokenStore,
                        apiClient = app.apiClient,
                        themeMode = themeMode,
                        isDarkTheme = darkTheme,
                        openChatThreadId = openChatThreadId,
                        onOpenChatConsumed = { openChatThreadId = null },
                        onThemeChange = { mode ->
                            themeMode = mode
                            AppSettings.setThemeMode(this, mode)
                        },
                        onLanguageChange = { language ->
                            AppSettings.setLanguage(this, language)
                            recreate()
                        },
                    )
                }
            }
        }
    }

    companion object {
        const val EXTRA_CHAT_THREAD_ID = "chat_thread_id"
    }
}

@Composable
private fun ThemeMode.resolveDark(): Boolean = when (this) {
    ThemeMode.SYSTEM -> isSystemInDarkTheme()
    ThemeMode.LIGHT -> false
    ThemeMode.DARK -> true
}
