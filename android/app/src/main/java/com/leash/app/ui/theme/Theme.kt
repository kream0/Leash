package com.leash.app.ui.theme

import android.app.Activity
import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val DarkColorScheme = darkColorScheme(
    primary = LeashPrimary,
    secondary = LeashSecondary,
    background = LeashBackground,
    surface = LeashSurface,
    surfaceVariant = LeashSurfaceVariant,
    onPrimary = LeashOnSurface,
    onSecondary = LeashOnSurface,
    onBackground = LeashOnSurface,
    onSurface = LeashOnSurface,
    onSurfaceVariant = LeashOnSurfaceVariant,
    error = LeashError
)

private val LightColorScheme = lightColorScheme(
    primary = LeashPrimaryDark,
    secondary = LeashSecondary,
    background = LeashOnSurface,
    surface = LeashOnSurface,
    onPrimary = LeashOnSurface,
    onSecondary = LeashOnSurface,
    onBackground = LeashBackground,
    onSurface = LeashBackground
)

@Composable
fun LeashTheme(
    darkTheme: Boolean = true, // Default to dark theme
    dynamicColor: Boolean = false,
    content: @Composable () -> Unit
) {
    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val context = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        }
        darkTheme -> DarkColorScheme
        else -> LightColorScheme
    }
    
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = colorScheme.background.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !darkTheme
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content
    )
}
