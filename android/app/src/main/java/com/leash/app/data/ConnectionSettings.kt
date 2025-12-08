package com.leash.app.data

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/** Manages server connection settings. */
class ConnectionSettings(context: Context) {
    private val prefs: SharedPreferences =
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    // Encrypted preferences for password storage
    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val encryptedPrefs: SharedPreferences = EncryptedSharedPreferences.create(
        context,
        ENCRYPTED_PREFS_NAME,
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    var serverUrl: String
        get() = prefs.getString(KEY_SERVER_URL, DEFAULT_URL) ?: DEFAULT_URL
        set(value) = prefs.edit().putString(KEY_SERVER_URL, value).apply()

    var password: String
        get() = encryptedPrefs.getString(KEY_PASSWORD, "") ?: ""
        set(value) = encryptedPrefs.edit().putString(KEY_PASSWORD, value).apply()

    val isConfigured: Boolean
        get() = prefs.contains(KEY_SERVER_URL)

    fun clear() {
        prefs.edit().remove(KEY_SERVER_URL).apply()
        encryptedPrefs.edit().remove(KEY_PASSWORD).apply()
    }

    companion object {
        private const val PREFS_NAME = "leash_connection"
        private const val ENCRYPTED_PREFS_NAME = "leash_secure"
        private const val KEY_SERVER_URL = "server_url"
        private const val KEY_PASSWORD = "password"
        private const val DEFAULT_URL = "ws://10.0.2.2:3000/ws" // Emulator localhost
    }
}
