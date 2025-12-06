package com.leash.app.data

import com.google.gson.Gson
import com.google.gson.JsonObject
import com.google.gson.reflect.TypeToken
import com.leash.app.model.Agent
import com.leash.app.model.AgentActivity
import com.leash.app.model.AgentStatus
import com.leash.app.model.AgentType
import com.leash.app.model.ChatMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.util.UUID
import java.util.concurrent.TimeUnit

/**
 * WebSocket client for real-time communication with the Leash server.
 */
class LeashWebSocketClient(
    private var serverUrl: String = "ws://10.0.2.2:3000/ws" // Android emulator localhost
) {
    private val client = OkHttpClient.Builder()
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .connectTimeout(10, TimeUnit.SECONDS)
        .build()

    // Derive HTTP URL from WebSocket URL
    private val httpBaseUrl: String
        get() = serverUrl
            .replace("ws://", "http://")
            .replace("wss://", "https://")
            .replace("/ws", "")
    
    private val gson = Gson()
    private var webSocket: WebSocket? = null
    private val scope = CoroutineScope(Dispatchers.IO)

    private val _connectionState = MutableStateFlow(ConnectionState.DISCONNECTED)
    val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

    private val _agents = MutableStateFlow<List<Agent>>(emptyList())
    val agents: StateFlow<List<Agent>> = _agents.asStateFlow()

    // Store activities per agent so they can be retrieved later
    private val _activitiesPerAgent = MutableStateFlow<Map<String, List<AgentActivity>>>(emptyMap())
    val activitiesPerAgent: StateFlow<Map<String, List<AgentActivity>>> = _activitiesPerAgent.asStateFlow()

    // Also keep the SharedFlow for real-time updates
    private val _activities = MutableSharedFlow<AgentActivity>(replay = 100)
    val activities: SharedFlow<AgentActivity> = _activities.asSharedFlow()

    // Real-time chat messages per agent
    private val _chatMessagesPerAgent = MutableStateFlow<Map<String, List<ChatMessage>>>(emptyMap())
    val chatMessagesPerAgent: StateFlow<Map<String, List<ChatMessage>>> = _chatMessagesPerAgent.asStateFlow()

    // SharedFlow for new chat messages
    private val _chatMessages = MutableSharedFlow<Pair<String, ChatMessage>>(replay = 100)
    val chatMessages: SharedFlow<Pair<String, ChatMessage>> = _chatMessages.asSharedFlow()

    // SharedFlow for message send status (clipboard copies)
    private val _messageSentStatus = MutableSharedFlow<MessageSentStatus>(replay = 1)
    val messageSentStatus: SharedFlow<MessageSentStatus> = _messageSentStatus.asSharedFlow()

    fun connect() {
        if (_connectionState.value == ConnectionState.CONNECTED) return
        
        _connectionState.value = ConnectionState.CONNECTING
        
        val request = Request.Builder()
            .url(serverUrl)
            .build()

        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                _connectionState.value = ConnectionState.CONNECTED
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                handleMessage(text)
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                webSocket.close(1000, null)
                _connectionState.value = ConnectionState.DISCONNECTED
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                _connectionState.value = ConnectionState.ERROR
            }
        })
    }

    fun disconnect() {
        webSocket?.close(1000, "Client closing")
        webSocket = null
        _connectionState.value = ConnectionState.DISCONNECTED
        // Clear stored activities
        _activitiesPerAgent.value = emptyMap()
    }

    fun sendMessage(agentId: String, message: String) {
        val json = gson.toJson(mapOf(
            "type" to "send_message",
            "agentId" to agentId,
            "message" to message
        ))
        webSocket?.send(json)
    }

    fun subscribeToAgent(agentId: String) {
        val json = gson.toJson(mapOf(
            "type" to "subscribe",
            "agentId" to agentId
        ))
        webSocket?.send(json)
    }

    /**
     * Get stored activities for a specific agent.
     */
    fun getActivitiesForAgent(agentId: String): List<AgentActivity> {
        return _activitiesPerAgent.value[agentId] ?: emptyList()
    }

    /**
     * Fetch chat history for an agent from the server.
     * This fetches the full conversation transcript.
     */
    suspend fun fetchChatHistory(agentId: String): List<ChatMessage> = withContext(Dispatchers.IO) {
        try {
            val request = Request.Builder()
                .url("$httpBaseUrl/api/agents/$agentId/chat")
                .get()
                .build()

            val response = client.newCall(request).execute()
            if (response.isSuccessful) {
                val body = response.body?.string() ?: return@withContext emptyList()
                val json = gson.fromJson(body, JsonObject::class.java)
                val messagesArray = json.getAsJsonArray("messages")

                messagesArray.map { element ->
                    val obj = element.asJsonObject
                    ChatMessage(
                        role = obj.get("role").asString,
                        content = obj.get("content").asString,
                        timestamp = obj.get("timestamp").asString
                    )
                }
            } else {
                emptyList()
            }
        } catch (e: Exception) {
            e.printStackTrace()
            emptyList()
        }
    }

    /**
     * Update the server URL (called when connecting via QR code).
     */
    fun updateServerUrl(url: String) {
        serverUrl = url
    }

    private fun handleMessage(text: String) {
        try {
            val json = gson.fromJson(text, JsonObject::class.java)
            when (json.get("type").asString) {
                "agents_list" -> handleAgentsList(json)
                "agent_connected" -> handleAgentConnected(json)
                "agent_disconnected" -> handleAgentDisconnected(json)
                "activity" -> handleActivity(json)
                "status_change" -> handleStatusChange(json)
                "chat_message" -> handleChatMessage(json)
                "message_sent" -> handleMessageSent(json)
                "error" -> handleError(json)
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun handleAgentsList(json: JsonObject) {
        val agentsArray = json.getAsJsonArray("agents")
        val agents = agentsArray.map { parseAgent(it.asJsonObject) }
        _agents.value = agents
    }

    private fun handleAgentConnected(json: JsonObject) {
        val agent = parseAgent(json.getAsJsonObject("agent"))
        _agents.value = _agents.value + agent
    }

    private fun handleAgentDisconnected(json: JsonObject) {
        val agentId = json.get("agentId").asString
        _agents.value = _agents.value.filter { it.id != agentId }
        // Clean up activities for this agent
        _activitiesPerAgent.value = _activitiesPerAgent.value - agentId
    }

    private fun handleActivity(json: JsonObject) {
        val activity = AgentActivity(
            id = UUID.randomUUID().toString(),
            agentId = json.get("agentId").asString,
            content = json.get("content").asString,
            timestamp = json.get("timestamp").asLong
        )
        
        // Store in per-agent map
        val currentActivities = _activitiesPerAgent.value.toMutableMap()
        val agentActivities = (currentActivities[activity.agentId] ?: emptyList()) + activity
        currentActivities[activity.agentId] = agentActivities.takeLast(100) // Keep last 100
        _activitiesPerAgent.value = currentActivities
        
        scope.launch {
            _activities.emit(activity)
        }
    }

    private fun handleStatusChange(json: JsonObject) {
        val agentId = json.get("agentId").asString
        val status = AgentStatus.fromString(json.get("status").asString)
        _agents.value = _agents.value.map {
            if (it.id == agentId) it.copy(status = status) else it
        }
    }

    private fun handleChatMessage(json: JsonObject) {
        val agentId = json.get("agentId").asString
        val messageObj = json.getAsJsonObject("message")

        val chatMessage = ChatMessage(
            role = messageObj.get("role").asString,
            content = messageObj.get("content").asString,
            timestamp = messageObj.get("timestamp").asString
        )

        // Store in per-agent map
        val currentMessages = _chatMessagesPerAgent.value.toMutableMap()
        val agentMessages = (currentMessages[agentId] ?: emptyList()) + chatMessage
        currentMessages[agentId] = agentMessages.takeLast(200) // Keep last 200 messages
        _chatMessagesPerAgent.value = currentMessages

        scope.launch {
            _chatMessages.emit(Pair(agentId, chatMessage))
        }
    }

    /**
     * Get stored chat messages for a specific agent.
     */
    fun getChatMessagesForAgent(agentId: String): List<ChatMessage> {
        return _chatMessagesPerAgent.value[agentId] ?: emptyList()
    }

    private fun handleMessageSent(json: JsonObject) {
        val agentId = json.get("agentId").asString
        val success = json.get("success").asBoolean
        val hint = json.get("hint")?.asString ?: "Message copied to clipboard"

        scope.launch {
            _messageSentStatus.emit(MessageSentStatus(agentId, success, hint))
        }
    }

    private fun handleError(json: JsonObject) {
        val error = json.get("error")?.asString ?: "Unknown error"
        scope.launch {
            _messageSentStatus.emit(MessageSentStatus("", false, error))
        }
    }

    private fun parseAgent(json: JsonObject): Agent = Agent(
        id = json.get("id").asString,
        name = json.get("name").asString,
        type = AgentType.fromString(json.get("type").asString),
        status = AgentStatus.fromString(json.get("status").asString),
        connectedAt = json.get("connectedAt").asLong
    )
}

/**
 * Status of a sent message (via clipboard)
 */
data class MessageSentStatus(
    val agentId: String,
    val success: Boolean,
    val hint: String
)

enum class ConnectionState {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
    ERROR
}
