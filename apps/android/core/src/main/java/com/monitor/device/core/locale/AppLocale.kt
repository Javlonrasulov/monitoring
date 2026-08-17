package com.monitor.device.core.locale

import android.content.Context
import android.content.res.Configuration
import java.util.Locale

/**
 * Single source of truth for the in-app language so that activities and the
 * monitoring service (which builds user-visible notifications) stay in sync.
 * Stored in plain prefs because it must be readable from attachBaseContext.
 */
object AppLocale {
    const val DEFAULT_TAG = "uz"

    private const val PREFS = "monitor_ui_prefs"
    private const val KEY_LANGUAGE = "app_language"

    fun tag(context: Context): String =
        prefs(context).getString(KEY_LANGUAGE, null) ?: DEFAULT_TAG

    fun setTag(context: Context, tag: String) {
        prefs(context).edit().putString(KEY_LANGUAGE, tag).apply()
    }

    /** Returns a context whose resources resolve to the selected language. */
    fun wrap(context: Context): Context {
        val locale = Locale(tag(context))
        Locale.setDefault(locale)
        val config = Configuration(context.resources.configuration)
        config.setLocale(locale)
        return context.createConfigurationContext(config)
    }

    // applicationContext is still null while Application.attachBaseContext runs,
    // so fall back to the context we were handed.
    private fun prefs(context: Context) =
        (context.applicationContext ?: context)
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
