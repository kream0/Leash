package com.leash.app.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Pets
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.leash.app.data.ConnectionSettings
import com.leash.app.ui.components.QrScannerDialog
import com.leash.app.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConnectionScreen(onConnected: (String) -> Unit) {
    val context = LocalContext.current
    val settings = remember { ConnectionSettings(context) }

    var serverUrl by remember { mutableStateOf(settings.serverUrl) }
    var showQrScanner by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    // Camera permission
    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                    PackageManager.PERMISSION_GRANTED
        )
    }

    val permissionLauncher =
        rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            hasCameraPermission = granted
            if (granted) showQrScanner = true
        }

    if (showQrScanner && hasCameraPermission) {
        QrScannerDialog(
            onDismiss = { showQrScanner = false },
            onScanned = { scannedUrl ->
                showQrScanner = false
                serverUrl = scannedUrl
            }
        )
    }

    Scaffold(containerColor = MaterialTheme.colorScheme.background) { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            // Logo and title
            Icon(
                Icons.Default.Pets,
                contentDescription = null,
                modifier = Modifier.size(72.dp),
                tint = LeashPrimary
            )

            Spacer(modifier = Modifier.height(16.dp))

            Text(
                text = "Leash",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onBackground
            )

            Text(
                text = "Connect to your AI agents",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(modifier = Modifier.height(48.dp))

            // QR Scanner button
            OutlinedButton(
                onClick = {
                    if (hasCameraPermission) {
                        showQrScanner = true
                    } else {
                        permissionLauncher.launch(Manifest.permission.CAMERA)
                    }
                },
                modifier = Modifier.fillMaxWidth().height(56.dp),
                shape = RoundedCornerShape(16.dp),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = LeashPrimary)
            ) {
                Icon(
                    Icons.Default.QrCodeScanner,
                    contentDescription = null,
                    modifier = Modifier.size(24.dp)
                )
                Spacer(modifier = Modifier.width(12.dp))
                Text("Scan QR Code", style = MaterialTheme.typography.titleMedium)
            }

            Spacer(modifier = Modifier.height(24.dp))

            // Divider
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Divider(modifier = Modifier.weight(1f))
                Text(
                    text = "or enter manually",
                    modifier = Modifier.padding(horizontal = 16.dp),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Divider(modifier = Modifier.weight(1f))
            }

            Spacer(modifier = Modifier.height(24.dp))

            // Manual URL input
            OutlinedTextField(
                value = serverUrl,
                onValueChange = {
                    serverUrl = it
                    errorMessage = null
                },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Server URL") },
                placeholder = { Text("ws://192.168.1.100:3000/ws") },
                shape = RoundedCornerShape(16.dp),
                singleLine = true,
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = LeashPrimary,
                    unfocusedBorderColor = MaterialTheme.colorScheme.surfaceVariant
                ),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(
                    onDone = {
                        if (validateUrl(serverUrl)) {
                            settings.serverUrl = serverUrl
                            onConnected(serverUrl)
                        } else {
                            errorMessage = "Invalid WebSocket URL"
                        }
                    }
                ),
                isError = errorMessage != null,
                supportingText = errorMessage?.let { { Text(it, color = LeashError) } }
            )

            Spacer(modifier = Modifier.height(24.dp))

            // Connect button
            Button(
                onClick = {
                    if (validateUrl(serverUrl)) {
                        settings.serverUrl = serverUrl
                        onConnected(serverUrl)
                    } else {
                        errorMessage = "Invalid WebSocket URL"
                    }
                },
                modifier = Modifier.fillMaxWidth().height(56.dp),
                shape = RoundedCornerShape(16.dp),
                colors = ButtonDefaults.buttonColors(containerColor = LeashPrimary)
            ) {
                Text("Connect", style = MaterialTheme.typography.titleMedium)
            }

            Spacer(modifier = Modifier.height(32.dp))

            // Help text
            Text(
                text = "Run the Leash server on your PC and scan\nthe QR code shown in the terminal",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )
        }
    }
}

private fun validateUrl(url: String): Boolean {
    return url.startsWith("ws://") || url.startsWith("wss://")
}
