package com.leash.app.data

import android.content.Context
import android.content.SharedPreferences

/** Manages server connection settings. */
class ConnectionSettings(context: Context) {
    private val prefs: SharedPreferences =
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    var serverUrl: String
        get() = prefs.getString(KEY_SERVER_URL, DEFAULT_URL) ?: DEFAULT_URL
        set(value) = prefs.edit().putString(KEY_SERVER_URL, value).apply()

    val isConfigured: Boolean
        get() = prefs.contains(KEY_SERVER_URL)

    fun clear() {
        prefs.edit().remove(KEY_SERVER_URL).apply()
    }

    companion object {
        private const val PREFS_NAME = "leash_connection"
        private const val KEY_SERVER_URL = "server_url"
        private const val DEFAULT_URL = "ws://10.0.2.2:3000/ws" // Emulator localhost
    }
}
