package com.leash.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.leash.app.data.AgentRepository
import com.leash.app.data.ConnectionState
import com.leash.app.model.Agent
import com.leash.app.model.AgentStatus
import com.leash.app.model.AgentType
import com.leash.app.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AgentListScreen(
        repository: AgentRepository,
        onAgentClick: (String) -> Unit,
        onDisconnect: () -> Unit = {}
) {
    val connectionState by repository.connectionState.collectAsState()
    val agents by repository.agents.collectAsState()

    LaunchedEffect(Unit) { repository.connect() }

    Scaffold(
            topBar = {
                TopAppBar(
                        title = {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                        "🐕 Leash",
                                        style = MaterialTheme.typography.headlineMedium,
                                        fontWeight = FontWeight.Bold
                                )
                            }
                        },
                        actions = {
                            ConnectionIndicator(connectionState)
                            IconButton(onClick = { repository.connect() }) {
                                Icon(Icons.Default.Refresh, contentDescription = "Reconnect")
                            }
                            IconButton(onClick = onDisconnect) {
                                Icon(Icons.Default.Settings, contentDescription = "Settings")
                            }
                        },
                        colors =
                                TopAppBarDefaults.topAppBarColors(
                                        containerColor = MaterialTheme.colorScheme.background
                                )
                )
            }
    ) { padding ->
        if (agents.isEmpty()) {
            EmptyState(
                    connectionState = connectionState,
                    modifier = Modifier.fillMaxSize().padding(padding)
            )
        } else {
            LazyColumn(
                    modifier = Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    contentPadding = PaddingValues(vertical = 16.dp)
            ) {
                items(agents) { agent ->
                    AgentCard(agent = agent, onClick = { onAgentClick(agent.id) })
                }
            }
        }
    }
}

@Composable
private fun ConnectionIndicator(state: ConnectionState) {
    val color =
            when (state) {
                ConnectionState.CONNECTED -> StatusActive
                ConnectionState.CONNECTING -> StatusIdle
                ConnectionState.DISCONNECTED -> StatusDisconnected
                ConnectionState.ERROR -> LeashError
            }

    Box(modifier = Modifier.padding(end = 8.dp).size(12.dp).clip(CircleShape).background(color))
}

@Composable
private fun AgentCard(agent: Agent, onClick: () -> Unit) {
    Card(
            modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Row(
                modifier = Modifier.fillMaxWidth().padding(16.dp),
                verticalAlignment = Alignment.CenterVertically
        ) {
            // Agent type icon
            Box(
                    modifier =
                            Modifier.size(48.dp)
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(LeashPrimary.copy(alpha = 0.1f)),
                    contentAlignment = Alignment.Center
            ) {
                Text(
                        text = if (agent.type == AgentType.CLAUDE_CODE) "🤖" else "✨",
                        style = MaterialTheme.typography.headlineMedium
                )
            }

            Spacer(modifier = Modifier.width(16.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                        text = agent.name,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface
                )
                Text(
                        text = agent.type.name.replace("_", " "),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            StatusChip(status = agent.status)
        }
    }
}

@Composable
private fun StatusChip(status: AgentStatus) {
    val (color, text) =
            when (status) {
                AgentStatus.ACTIVE -> StatusActive to "Active"
                AgentStatus.IDLE -> StatusIdle to "Idle"
                AgentStatus.DISCONNECTED -> StatusDisconnected to "Offline"
            }

    Surface(shape = RoundedCornerShape(8.dp), color = color.copy(alpha = 0.15f)) {
        Text(
                text = text,
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                style = MaterialTheme.typography.labelMedium,
                color = color
        )
    }
}

@Composable
private fun EmptyState(connectionState: ConnectionState, modifier: Modifier = Modifier) {
    Column(
            modifier = modifier,
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
    ) {
        Text(text = "🔌", style = MaterialTheme.typography.displayLarge)
        Spacer(modifier = Modifier.height(16.dp))
        Text(
                text =
                        when (connectionState) {
                            ConnectionState.CONNECTING -> "Connecting..."
                            ConnectionState.ERROR -> "Connection failed"
                            else -> "No agents connected"
                        },
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface
        )
        Text(
                text = "Start an AI agent on your PC",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}
