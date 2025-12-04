package com.leash.app.data

import com.google.gson.Gson
import com.google.gson.JsonObject
import com.leash.app.model.Agent
import com.leash.app.model.AgentActivity
import com.leash.app.model.AgentStatus
import com.leash.app.model.AgentType
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
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
    private val serverUrl: String = "ws://10.0.2.2:3000/ws" // Android emulator localhost
) {
    private val client = OkHttpClient.Builder()
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .build()
    
    private val gson = Gson()
    private var webSocket: WebSocket? = null
    private val scope = CoroutineScope(Dispatchers.IO)

    private val _connectionState = MutableStateFlow(ConnectionState.DISCONNECTED)
    val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

    private val _agents = MutableStateFlow<List<Agent>>(emptyList())
    val agents: StateFlow<List<Agent>> = _agents.asStateFlow()

    private val _activities = MutableSharedFlow<AgentActivity>()
    val activities: SharedFlow<AgentActivity> = _activities.asSharedFlow()

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

    private fun handleMessage(text: String) {
        try {
            val json = gson.fromJson(text, JsonObject::class.java)
            when (json.get("type").asString) {
                "agents_list" -> handleAgentsList(json)
                "agent_connected" -> handleAgentConnected(json)
                "agent_disconnected" -> handleAgentDisconnected(json)
                "activity" -> handleActivity(json)
                "status_change" -> handleStatusChange(json)
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
    }

    private fun handleActivity(json: JsonObject) {
        val activity = AgentActivity(
            id = UUID.randomUUID().toString(),
            agentId = json.get("agentId").asString,
            content = json.get("content").asString,
            timestamp = json.get("timestamp").asLong
        )
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

    private fun parseAgent(json: JsonObject): Agent = Agent(
        id = json.get("id").asString,
        name = json.get("name").asString,
        type = AgentType.fromString(json.get("type").asString),
        status = AgentStatus.fromString(json.get("status").asString),
        connectedAt = json.get("connectedAt").asLong
    )
}

enum class ConnectionState {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
    ERROR
}
