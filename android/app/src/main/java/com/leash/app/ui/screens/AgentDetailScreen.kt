package com.leash.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.leash.app.data.AgentRepository
import com.leash.app.model.AgentActivity
import com.leash.app.model.AgentStatus
import com.leash.app.ui.theme.*
import java.text.SimpleDateFormat
import java.util.*
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AgentDetailScreen(agentId: String, repository: AgentRepository, onBackClick: () -> Unit) {
    val agents by repository.agents.collectAsState()
    val agent = agents.find { it.id == agentId }

    // Collect all activities for this agent from the StateFlow
    val allActivities by repository.activitiesPerAgent.collectAsState()
    val storedActivities = allActivities[agentId] ?: emptyList()

    var activities by remember { mutableStateOf<List<AgentActivity>>(emptyList()) }
    var messageText by remember { mutableStateOf("") }

    val listState = rememberLazyListState()
    val coroutineScope = rememberCoroutineScope()

    // Initialize with stored activities
    LaunchedEffect(agentId, storedActivities) {
        activities = storedActivities
        if (activities.isNotEmpty()) {
            coroutineScope.launch { listState.animateScrollToItem(activities.size) }
        }
    }

    // Listen for new activities
    LaunchedEffect(agentId) {
        repository.subscribeToAgent(agentId)
        repository.activities.collect { activity ->
            if (activity.agentId == agentId) {
                activities = activities + activity
                coroutineScope.launch { listState.animateScrollToItem(activities.size) }
            }
        }
    }

    Scaffold(
            topBar = {
                TopAppBar(
                        title = {
                            if (agent != null) {
                                Column {
                                    Text(
                                            text = agent.name,
                                            style = MaterialTheme.typography.titleMedium,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis
                                    )
                                    Text(
                                            text = agent.type.name.replace("_", " "),
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                        },
                        navigationIcon = {
                            IconButton(onClick = onBackClick) {
                                Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                            }
                        },
                        actions = {
                            if (agent != null) {
                                StatusIndicator(status = agent.status)
                            }
                        },
                        colors =
                                TopAppBarDefaults.topAppBarColors(
                                        containerColor = MaterialTheme.colorScheme.background
                                )
                )
            },
            bottomBar = {
                MessageInput(
                        text = messageText,
                        onTextChange = { messageText = it },
                        onSend = {
                            if (messageText.isNotBlank()) {
                                repository.sendMessage(agentId, messageText)
                                messageText = ""
                            }
                        }
                )
            }
    ) { padding ->
        if (activities.isEmpty()) {
            Box(
                    modifier = Modifier.fillMaxSize().padding(padding),
                    contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(text = "👀", style = MaterialTheme.typography.displayLarge)
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                            text = "Watching for activity...",
                            style = MaterialTheme.typography.titleMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        } else {
            LazyColumn(
                    state = listState,
                    modifier = Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    contentPadding = PaddingValues(vertical = 16.dp)
            ) { items(activities) { activity -> ActivityBubble(activity = activity) } }
        }
    }
}

@Composable
private fun StatusIndicator(status: AgentStatus) {
    val (color, text) =
            when (status) {
                AgentStatus.ACTIVE -> StatusActive to "Active"
                AgentStatus.IDLE -> StatusIdle to "Idle"
                AgentStatus.DISCONNECTED -> StatusDisconnected to "Offline"
            }

    Row(modifier = Modifier.padding(end = 16.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(modifier = Modifier.size(8.dp).clip(RoundedCornerShape(50)).background(color))
        Spacer(modifier = Modifier.width(6.dp))
        Text(text = text, style = MaterialTheme.typography.labelMedium, color = color)
    }
}

@Composable
private fun ActivityBubble(activity: AgentActivity) {
    val isInput = activity.content.startsWith(">")
    val timeFormat = remember { SimpleDateFormat("HH:mm", Locale.getDefault()) }

    Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = if (isInput) Alignment.End else Alignment.Start
    ) {
        Surface(
                shape =
                        RoundedCornerShape(
                                topStart = 16.dp,
                                topEnd = 16.dp,
                                bottomStart = if (isInput) 16.dp else 4.dp,
                                bottomEnd = if (isInput) 4.dp else 16.dp
                        ),
                color = if (isInput) LeashPrimary else MaterialTheme.colorScheme.surfaceVariant,
                modifier = Modifier.widthIn(max = 300.dp)
        ) {
            Text(
                    text = activity.content,
                    modifier = Modifier.padding(12.dp),
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (isInput) LeashOnSurface else MaterialTheme.colorScheme.onSurface
            )
        }

        Text(
                text = timeFormat.format(Date(activity.timestamp)),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp, start = 4.dp, end = 4.dp)
        )
    }
}

@Composable
private fun MessageInput(text: String, onTextChange: (String) -> Unit, onSend: () -> Unit) {
    Surface(color = MaterialTheme.colorScheme.surface, tonalElevation = 8.dp) {
        Row(
                modifier = Modifier.fillMaxWidth().padding(16.dp),
                verticalAlignment = Alignment.CenterVertically
        ) {
            OutlinedTextField(
                    value = text,
                    onValueChange = onTextChange,
                    modifier = Modifier.weight(1f),
                    placeholder = { Text("Send a message...") },
                    shape = RoundedCornerShape(24.dp),
                    colors =
                            OutlinedTextFieldDefaults.colors(
                                    focusedBorderColor = LeashPrimary,
                                    unfocusedBorderColor = MaterialTheme.colorScheme.surfaceVariant
                            ),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                    keyboardActions = KeyboardActions(onSend = { onSend() }),
                    singleLine = true
            )

            Spacer(modifier = Modifier.width(12.dp))

            FilledIconButton(
                    onClick = onSend,
                    colors =
                            IconButtonDefaults.filledIconButtonColors(containerColor = LeashPrimary)
            ) { Icon(Icons.Default.Send, contentDescription = "Send") }
        }
    }
}
