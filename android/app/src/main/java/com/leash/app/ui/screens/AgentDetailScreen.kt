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
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import com.leash.app.data.AgentRepository
import com.leash.app.model.AgentActivity
import com.leash.app.model.AgentStatus
import com.leash.app.model.ChatMessage
import com.leash.app.ui.theme.*
import java.text.SimpleDateFormat
import java.util.*
import kotlinx.coroutines.launch

private enum class ViewTab { ACTIVITY, CHAT }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AgentDetailScreen(agentId: String, repository: AgentRepository, onBackClick: () -> Unit) {
    val agents by repository.agents.collectAsState()
    val agent = agents.find { it.id == agentId }

    // Collect all activities for this agent from the StateFlow
    val allActivities by repository.activitiesPerAgent.collectAsState()
    val storedActivities = allActivities[agentId] ?: emptyList()

    // Collect all chat messages for this agent from the StateFlow
    val allChatMessages by repository.chatMessagesPerAgent.collectAsState()
    val storedChatMessages = allChatMessages[agentId] ?: emptyList()

    var activities by remember { mutableStateOf<List<AgentActivity>>(emptyList()) }
    var chatMessages by remember { mutableStateOf<List<ChatMessage>>(emptyList()) }
    var messageText by remember { mutableStateOf("") }
    var selectedTab by remember { mutableStateOf(ViewTab.ACTIVITY) }

    val activityListState = rememberLazyListState()
    val chatListState = rememberLazyListState()
    val coroutineScope = rememberCoroutineScope()

    // Initialize with stored activities
    LaunchedEffect(agentId, storedActivities) {
        activities = storedActivities
        if (activities.isNotEmpty()) {
            coroutineScope.launch { activityListState.animateScrollToItem(activities.size) }
        }
    }

    // Initialize with stored chat messages (real-time)
    LaunchedEffect(agentId, storedChatMessages) {
        chatMessages = storedChatMessages
        if (chatMessages.isNotEmpty() && selectedTab == ViewTab.CHAT) {
            coroutineScope.launch { chatListState.animateScrollToItem(chatMessages.size) }
        }
    }

    // Listen for new activities
    LaunchedEffect(agentId) {
        repository.subscribeToAgent(agentId)
        repository.activities.collect { activity ->
            if (activity.agentId == agentId) {
                activities = activities + activity
                coroutineScope.launch { activityListState.animateScrollToItem(activities.size) }
            }
        }
    }

    // Listen for new chat messages (real-time)
    LaunchedEffect(agentId) {
        repository.chatMessages.collect { (msgAgentId, message) ->
            if (msgAgentId == agentId) {
                // Only add if not already in the list (avoid duplicates from storedChatMessages)
                if (chatMessages.none { it.timestamp == message.timestamp && it.content == message.content }) {
                    chatMessages = chatMessages + message
                    if (selectedTab == ViewTab.CHAT) {
                        coroutineScope.launch { chatListState.animateScrollToItem(chatMessages.size) }
                    }
                }
            }
        }
    }

    // Auto-scroll to bottom when switching to Chat tab
    LaunchedEffect(selectedTab) {
        if (selectedTab == ViewTab.CHAT && chatMessages.isNotEmpty()) {
            coroutineScope.launch { chatListState.animateScrollToItem(chatMessages.size) }
        }
    }

    Scaffold(
            topBar = {
                Column {
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
                    // Tab selector
                    TabRow(
                            selectedTabIndex = if (selectedTab == ViewTab.ACTIVITY) 0 else 1,
                            containerColor = MaterialTheme.colorScheme.background
                    ) {
                        Tab(
                                selected = selectedTab == ViewTab.ACTIVITY,
                                onClick = { selectedTab = ViewTab.ACTIVITY },
                                text = { Text("Activity") },
                                icon = { Icon(Icons.Default.Notifications, contentDescription = null) }
                        )
                        Tab(
                                selected = selectedTab == ViewTab.CHAT,
                                onClick = { selectedTab = ViewTab.CHAT },
                                text = { Text("Chat") },
                                icon = { Icon(Icons.Default.Chat, contentDescription = null) }
                        )
                    }
                }
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
        when (selectedTab) {
            ViewTab.ACTIVITY -> {
                if (activities.isEmpty()) {
                    EmptyState(
                            emoji = "👀",
                            message = "Watching for activity...",
                            modifier = Modifier.padding(padding)
                    )
                } else {
                    LazyColumn(
                            state = activityListState,
                            modifier = Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                            contentPadding = PaddingValues(vertical = 16.dp)
                    ) { items(activities) { activity -> ActivityBubble(activity = activity) } }
                }
            }
            ViewTab.CHAT -> {
                if (chatMessages.isEmpty()) {
                    EmptyState(
                            emoji = "💬",
                            message = "Waiting for messages...",
                            modifier = Modifier.padding(padding)
                    )
                } else {
                    LazyColumn(
                            state = chatListState,
                            modifier = Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                            contentPadding = PaddingValues(vertical = 16.dp)
                    ) { items(chatMessages) { message -> ChatBubble(message = message) } }
                }
            }
        }
    }
}

@Composable
private fun EmptyState(emoji: String, message: String, modifier: Modifier = Modifier) {
    Box(
            modifier = modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(text = emoji, style = MaterialTheme.typography.displayLarge)
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                    text = message,
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
            )
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

// Git diff colors
private val DiffAddColor = Color(0xFF22863A) // Green for additions
private val DiffRemoveColor = Color(0xFFCB2431) // Red for deletions
private val DiffAddBgColor = Color(0xFFE6FFEC) // Light green background
private val DiffRemoveBgColor = Color(0xFFFFEBE9) // Light red background

@Composable
private fun ChatBubble(message: ChatMessage) {
    val isUser = message.isUser

    Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = if (isUser) Alignment.End else Alignment.Start
    ) {
        // Role label
        Text(
                text = if (isUser) "You" else "Claude",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(bottom = 4.dp, start = 4.dp, end = 4.dp)
        )

        Surface(
                shape =
                        RoundedCornerShape(
                                topStart = 16.dp,
                                topEnd = 16.dp,
                                bottomStart = if (isUser) 16.dp else 4.dp,
                                bottomEnd = if (isUser) 4.dp else 16.dp
                        ),
                color = if (isUser) LeashPrimary else MaterialTheme.colorScheme.surfaceVariant,
                modifier = Modifier.fillMaxWidth()
        ) {
            // Check if content contains diff lines
            val hasDiff = message.content.contains("\n- ") || message.content.contains("\n+ ")

            if (hasDiff && !isUser) {
                // Render with diff coloring
                DiffText(
                        text = message.content,
                        modifier = Modifier.padding(12.dp),
                        style = MaterialTheme.typography.bodyMedium
                )
            } else {
                Text(
                        text = message.content,
                        modifier = Modifier.padding(12.dp),
                        style = MaterialTheme.typography.bodyMedium,
                        color = if (isUser) LeashOnSurface else MaterialTheme.colorScheme.onSurface
                )
            }
        }

        Text(
                text = message.timestamp,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp, start = 4.dp, end = 4.dp)
        )
    }
}

@Composable
private fun DiffText(text: String, modifier: Modifier = Modifier, style: androidx.compose.ui.text.TextStyle) {
    val annotatedString = buildAnnotatedString {
        val lines = text.split("\n")
        lines.forEachIndexed { index, line ->
            when {
                line.startsWith("- ") -> {
                    withStyle(SpanStyle(color = DiffRemoveColor, background = DiffRemoveBgColor)) {
                        append(line)
                    }
                }
                line.startsWith("+ ") -> {
                    withStyle(SpanStyle(color = DiffAddColor, background = DiffAddBgColor)) {
                        append(line)
                    }
                }
                else -> {
                    withStyle(SpanStyle(color = MaterialTheme.colorScheme.onSurface)) {
                        append(line)
                    }
                }
            }
            if (index < lines.size - 1) {
                append("\n")
            }
        }
    }

    Text(
            text = annotatedString,
            modifier = modifier,
            style = style
    )
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
