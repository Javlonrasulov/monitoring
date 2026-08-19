package com.monitor.device.settings

import android.content.Context
import com.monitor.device.core.locale.AppLocale

enum class AppLanguage(val tag: String) {
    ENGLISH("en"),
    RUSSIAN("ru"),
    ;

    companion object {
        val Default = ENGLISH

        fun fromTag(tag: String?): AppLanguage =
            entries.firstOrNull { it.tag == tag } ?: Default
    }
}

enum class ThemeMode {
    SYSTEM,
    LIGHT,
    DARK,
    ;

    companion object {
        val Default = SYSTEM

        fun fromName(name: String?): ThemeMode =
            entries.firstOrNull { it.name == name } ?: Default
    }
}

/**
 * Presentation preferences (language, theme). Stored in plain prefs so the
 * locale can be applied from Activity.attachBaseContext before any UI exists.
 */
object AppSettings {
    private const val PREFS = "monitor_ui_prefs"
    private const val KEY_THEME = "theme_mode"

    fun language(context: Context): AppLanguage =
        AppLanguage.fromTag(AppLocale.tag(context))

    fun setLanguage(context: Context, language: AppLanguage) {
        AppLocale.setTag(context, language.tag)
    }

    fun themeMode(context: Context): ThemeMode =
        ThemeMode.fromName(prefs(context).getString(KEY_THEME, null))

    fun setThemeMode(context: Context, mode: ThemeMode) {
        prefs(context).edit().putString(KEY_THEME, mode.name).apply()
    }

    /** Applies the stored language to a base context before inflation. */
    fun applyLanguage(context: Context): Context = AppLocale.wrap(context)

    private fun prefs(context: Context) =
        (context.applicationContext ?: context)
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
