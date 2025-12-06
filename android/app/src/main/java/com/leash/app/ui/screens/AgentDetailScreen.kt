package com.leash.app.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import com.leash.app.data.AgentRepository
import com.leash.app.model.AgentStatus
import com.leash.app.model.ChatMessage
import com.leash.app.ui.theme.*
import java.text.SimpleDateFormat
import java.util.*
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AgentDetailScreen(agentId: String, repository: AgentRepository, onBackClick: () -> Unit) {
    val agents by repository.agents.collectAsState()
    val agent = agents.find { it.id == agentId }

    // Collect all chat messages for this agent from the StateFlow
    val allChatMessages by repository.chatMessagesPerAgent.collectAsState()
    val storedChatMessages = allChatMessages[agentId] ?: emptyList()

    var chatMessages by remember { mutableStateOf<List<ChatMessage>>(emptyList()) }
    var messageText by remember { mutableStateOf("") }
    var showMenu by remember { mutableStateOf(false) }
    var autopilotEnabled by remember { mutableStateOf(false) }

    val chatListState = rememberLazyListState()
    val coroutineScope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }

    // Initialize with stored chat messages (real-time) - instant scroll
    LaunchedEffect(agentId, storedChatMessages) {
        chatMessages = storedChatMessages
        if (chatMessages.isNotEmpty()) {
            coroutineScope.launch { chatListState.scrollToItem(chatMessages.size) }
        }
    }

    // Listen for new chat messages (real-time)
    LaunchedEffect(agentId) {
        repository.chatMessages.collect { (msgAgentId, message) ->
            if (msgAgentId == agentId) {
                // Only add if not already in the list (avoid duplicates from storedChatMessages)
                if (chatMessages.none { it.timestamp == message.timestamp && it.content == message.content }) {
                    chatMessages = chatMessages + message
                    coroutineScope.launch { chatListState.scrollToItem(chatMessages.size) }
                }
            }
        }
    }

    // Listen for message sent status
    LaunchedEffect(agentId) {
        repository.messageSentStatus.collect { status ->
            if (status.agentId == agentId || status.agentId.isEmpty()) {
                snackbarHostState.showSnackbar(status.hint, duration = SnackbarDuration.Short)
            }
        }
    }

    // Autopilot: Listen for Stop events and auto-send continue
    LaunchedEffect(agentId, autopilotEnabled) {
        if (autopilotEnabled) {
            repository.activities.collect { activity ->
                if (activity.agentId == agentId && activity.content.contains("Response complete")) {
                    // Agent stopped, send continue
                    repository.sendMessage(agentId, "continue")
                }
            }
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
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
                    // Interrupt button
                    IconButton(
                        onClick = { repository.sendInterrupt(agentId) },
                        colors = IconButtonDefaults.iconButtonColors(
                            contentColor = MaterialTheme.colorScheme.error
                        )
                    ) {
                        Icon(Icons.Default.Stop, contentDescription = "Interrupt")
                    }

                    // Status indicator
                    if (agent != null) {
                        StatusIndicator(status = agent.status)
                    }

                    // Menu
                    Box {
                        IconButton(onClick = { showMenu = true }) {
                            Icon(Icons.Default.MoreVert, contentDescription = "Menu")
                        }
                        DropdownMenu(
                            expanded = showMenu,
                            onDismissRequest = { showMenu = false }
                        ) {
                            DropdownMenuItem(
                                text = {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Text("Autopilot")
                                        Spacer(Modifier.weight(1f))
                                        Switch(
                                            checked = autopilotEnabled,
                                            onCheckedChange = {
                                                autopilotEnabled = it
                                                showMenu = false
                                            },
                                            modifier = Modifier.padding(start = 8.dp)
                                        )
                                    }
                                },
                                onClick = {
                                    autopilotEnabled = !autopilotEnabled
                                    showMenu = false
                                },
                                leadingIcon = {
                                    Icon(
                                        if (autopilotEnabled) Icons.Default.PlayCircle else Icons.Default.PlayCircleOutline,
                                        contentDescription = null
                                    )
                                }
                            )
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
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
                },
                onContinue = {
                    repository.sendMessage(agentId, "continue")
                }
            )
        }
    ) { padding ->
        if (chatMessages.isEmpty()) {
            EmptyState(
                message = "Waiting for messages...",
                modifier = Modifier.padding(padding)
            )
        } else {
            LazyColumn(
                state = chatListState,
                modifier = Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                contentPadding = PaddingValues(vertical = 16.dp)
            ) {
                items(chatMessages) { message ->
                    ChatBubble(message = message)
                }
            }
        }
    }
}

@Composable
private fun EmptyState(message: String, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(
                Icons.Default.Chat,
                contentDescription = null,
                modifier = Modifier.size(64.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant
            )
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
    val (color, text) = when (status) {
        AgentStatus.ACTIVE -> StatusActive to "Active"
        AgentStatus.IDLE -> StatusIdle to "Idle"
        AgentStatus.DISCONNECTED -> StatusDisconnected to "Offline"
    }

    Row(modifier = Modifier.padding(end = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(modifier = Modifier.size(8.dp).clip(RoundedCornerShape(50)).background(color))
        Spacer(modifier = Modifier.width(6.dp))
        Text(text = text, style = MaterialTheme.typography.labelMedium, color = color)
    }
}

// Git diff colors
private val DiffAddBgColor = Color(0xFF1B4721)
private val DiffRemoveBgColor = Color(0xFF4A1D1D)
private val DiffHeaderColor = Color(0xFF58A6FF)
private val DiffContextColor = Color(0xFF8B949E)

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
            shape = RoundedCornerShape(
                topStart = 16.dp,
                topEnd = 16.dp,
                bottomStart = if (isUser) 16.dp else 4.dp,
                bottomEnd = if (isUser) 4.dp else 16.dp
            ),
            color = if (isUser) LeashPrimary else MaterialTheme.colorScheme.surfaceVariant,
            modifier = Modifier.fillMaxWidth()
        ) {
            // Check if content contains diff lines
            val diffInfo = if (!isUser) analyzeDiffContent(message.content) else null
            val hasDiff = diffInfo != null && diffInfo.isDiff

            if (hasDiff && diffInfo != null) {
                // Render with diff coloring, potentially collapsible
                if (diffInfo.totalLines > 10) {
                    CollapsibleDiffText(
                        text = message.content,
                        lineCount = diffInfo.totalLines,
                        modifier = Modifier.padding(12.dp)
                    )
                } else {
                    DiffText(
                        text = message.content,
                        modifier = Modifier.padding(12.dp),
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
            } else {
                Text(
                    text = message.content,
                    modifier = Modifier.padding(12.dp),
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (isUser) LeashOnSurface else MaterialTheme.colorScheme.onSurface
                )
            }
        }

        // Formatted timestamp
        Text(
            text = formatMessageTime(message.timestamp),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 4.dp, start = 4.dp, end = 4.dp)
        )
    }
}

/**
 * Format timestamp: show time only if today, otherwise show date
 */
private fun formatMessageTime(timestamp: String): String {
    return try {
        // Try to parse ISO format
        val isoFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault())
        val date = isoFormat.parse(timestamp.substringBefore(".").substringBefore("Z"))

        if (date != null) {
            val now = Calendar.getInstance()
            val msgCal = Calendar.getInstance().apply { time = date }

            val isToday = now.get(Calendar.YEAR) == msgCal.get(Calendar.YEAR) &&
                    now.get(Calendar.DAY_OF_YEAR) == msgCal.get(Calendar.DAY_OF_YEAR)

            if (isToday) {
                SimpleDateFormat("HH:mm", Locale.getDefault()).format(date)
            } else {
                SimpleDateFormat("MMM d, HH:mm", Locale.getDefault()).format(date)
            }
        } else {
            timestamp
        }
    } catch (e: Exception) {
        // If parsing fails, try to extract time from the string
        if (timestamp.contains("T")) {
            timestamp.substringAfter("T").substringBefore(".").substringBefore("Z").take(5)
        } else {
            timestamp
        }
    }
}

/**
 * Analyze content for diff patterns - more accurate detection
 */
private data class DiffAnalysis(
    val isDiff: Boolean,
    val totalLines: Int,
    val addedLines: Int,
    val removedLines: Int
)

private fun analyzeDiffContent(text: String): DiffAnalysis {
    val lines = text.split("\n")
    var addCount = 0
    var removeCount = 0
    var hasEditHeader = false
    var hasHunkHeader = false

    for (line in lines) {
        val trimmed = line.trimStart()
        when {
            // Must have an Edit/File header or @@ hunk marker to be a real diff
            trimmed.startsWith("Edit:") ||
            trimmed.startsWith("File:") ||
            trimmed.startsWith("@@") -> {
                hasEditHeader = true
                if (trimmed.startsWith("@@")) hasHunkHeader = true
            }
            // Count additions (must be in a diff context)
            trimmed.startsWith("+") && !trimmed.startsWith("+++") -> addCount++
            // Count deletions (must be in a diff context, not markdown lists)
            trimmed.startsWith("-") &&
            !trimmed.startsWith("---") &&
            !trimmed.startsWith("- [") &&
            !trimmed.startsWith("- **") &&
            !trimmed.matches(Regex("^-\\s+[A-Z].*")) &&
            !trimmed.matches(Regex("^-\\s+\\w+:.*")) -> removeCount++
        }
    }

    // Only consider it a diff if:
    // 1. Has an Edit/File header OR @@ markers
    // 2. Has at least one add or remove line
    val isDiff = hasEditHeader && (addCount > 0 || removeCount > 0)

    return DiffAnalysis(
        isDiff = isDiff,
        totalLines = addCount + removeCount,
        addedLines = addCount,
        removedLines = removeCount
    )
}

/**
 * Collapsible diff text for large diffs
 */
@Composable
private fun CollapsibleDiffText(
    text: String,
    lineCount: Int,
    modifier: Modifier = Modifier
) {
    var expanded by remember { mutableStateOf(false) }

    Column(modifier = modifier) {
        // Header with expand/collapse
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { expanded = !expanded }
                .padding(bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                if (expanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                contentDescription = if (expanded) "Collapse" else "Expand",
                tint = DiffHeaderColor,
                modifier = Modifier.size(20.dp)
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = "Code changes ($lineCount lines)",
                style = MaterialTheme.typography.labelMedium,
                color = DiffHeaderColor,
                fontWeight = FontWeight.Bold
            )
        }

        AnimatedVisibility(
            visible = expanded,
            enter = expandVertically(),
            exit = shrinkVertically()
        ) {
            DiffText(
                text = text,
                modifier = Modifier,
                style = MaterialTheme.typography.bodyMedium
            )
        }

        if (!expanded) {
            Text(
                text = "Tap to expand",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

private enum class DiffLineType {
    ADDITION,
    DELETION,
    FILE_HEADER,
    CONTEXT,
    NORMAL
}

private fun getDiffLineType(line: String): DiffLineType {
    val trimmed = line.trimStart()
    return when {
        trimmed.startsWith("Edit:") ||
        trimmed.startsWith("File:") ||
        trimmed.startsWith("---") ||
        trimmed.startsWith("+++") ||
        trimmed.startsWith("@@") -> DiffLineType.FILE_HEADER

        trimmed.startsWith("+") && !trimmed.startsWith("+++") -> DiffLineType.ADDITION

        trimmed.startsWith("-") &&
        !trimmed.startsWith("---") &&
        !trimmed.startsWith("- [") &&
        !trimmed.startsWith("- **") &&
        !trimmed.matches(Regex("^-\\s+[A-Z].*")) &&
        !trimmed.matches(Regex("^-\\s+\\w+:.*")) -> DiffLineType.DELETION

        trimmed.startsWith(" ") -> DiffLineType.CONTEXT

        else -> DiffLineType.NORMAL
    }
}

@Composable
private fun DiffText(text: String, modifier: Modifier = Modifier, style: androidx.compose.ui.text.TextStyle) {
    val onSurface = MaterialTheme.colorScheme.onSurface

    val annotatedString = buildAnnotatedString {
        val lines = text.split("\n")
        lines.forEachIndexed { index, line ->
            val lineType = getDiffLineType(line)

            when (lineType) {
                DiffLineType.FILE_HEADER -> {
                    withStyle(SpanStyle(
                        color = DiffHeaderColor,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace
                    )) {
                        append(line)
                    }
                }
                DiffLineType.ADDITION -> {
                    withStyle(SpanStyle(
                        color = Color(0xFF7EE787),
                        background = DiffAddBgColor,
                        fontFamily = FontFamily.Monospace
                    )) {
                        append(line)
                    }
                }
                DiffLineType.DELETION -> {
                    withStyle(SpanStyle(
                        color = Color(0xFFF97583),
                        background = DiffRemoveBgColor,
                        fontFamily = FontFamily.Monospace
                    )) {
                        append(line)
                    }
                }
                DiffLineType.CONTEXT -> {
                    withStyle(SpanStyle(
                        color = DiffContextColor,
                        fontFamily = FontFamily.Monospace
                    )) {
                        append(line)
                    }
                }
                DiffLineType.NORMAL -> {
                    withStyle(SpanStyle(color = onSurface)) {
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
private fun MessageInput(
    text: String,
    onTextChange: (String) -> Unit,
    onSend: () -> Unit,
    onContinue: () -> Unit
) {
    Surface(color = MaterialTheme.colorScheme.surface, tonalElevation = 8.dp) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Continue button
            FilledTonalIconButton(
                onClick = onContinue,
                colors = IconButtonDefaults.filledTonalIconButtonColors(
                    containerColor = LeashSecondary.copy(alpha = 0.2f),
                    contentColor = LeashSecondary
                )
            ) {
                Icon(Icons.Default.PlayArrow, contentDescription = "Continue")
            }

            Spacer(modifier = Modifier.width(8.dp))

            OutlinedTextField(
                value = text,
                onValueChange = onTextChange,
                modifier = Modifier.weight(1f),
                placeholder = { Text("Send a message...") },
                shape = RoundedCornerShape(24.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = LeashPrimary,
                    unfocusedBorderColor = MaterialTheme.colorScheme.surfaceVariant
                ),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                keyboardActions = KeyboardActions(onSend = { onSend() }),
                singleLine = true
            )

            Spacer(modifier = Modifier.width(8.dp))

            FilledIconButton(
                onClick = onSend,
                colors = IconButtonDefaults.filledIconButtonColors(containerColor = LeashPrimary)
            ) {
                Icon(Icons.Default.Send, contentDescription = "Send")
            }
        }
    }
}
