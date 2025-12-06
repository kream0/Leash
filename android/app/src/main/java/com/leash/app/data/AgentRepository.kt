package com.leash.app.data

import com.leash.app.model.Agent
import com.leash.app.model.AgentActivity
import com.leash.app.model.ChatMessage
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow

/** Repository for managing agent data and server communication. */
class AgentRepository(private val webSocketClient: LeashWebSocketClient = LeashWebSocketClient()) {
    val connectionState: StateFlow<ConnectionState> = webSocketClient.connectionState
    val agents: StateFlow<List<Agent>> = webSocketClient.agents
    val activities: SharedFlow<AgentActivity> = webSocketClient.activities
    val activitiesPerAgent: StateFlow<Map<String, List<AgentActivity>>> =
            webSocketClient.activitiesPerAgent
    val chatMessagesPerAgent: StateFlow<Map<String, List<ChatMessage>>> =
            webSocketClient.chatMessagesPerAgent
    val chatMessages: SharedFlow<Pair<String, ChatMessage>> = webSocketClient.chatMessages
    val messageSentStatus: SharedFlow<MessageSentStatus> = webSocketClient.messageSentStatus

    fun connect() {
        webSocketClient.connect()
    }

    fun disconnect() {
        webSocketClient.disconnect()
    }

    fun sendMessage(agentId: String, message: String) {
        webSocketClient.sendMessage(agentId, message)
    }

    fun sendInterrupt(agentId: String) {
        webSocketClient.sendInterrupt(agentId)
    }

    fun subscribeToAgent(agentId: String) {
        webSocketClient.subscribeToAgent(agentId)
    }

    fun getAgent(agentId: String): Agent? {
        return agents.value.find { it.id == agentId }
    }

    fun getActivitiesForAgent(agentId: String): List<AgentActivity> {
        return webSocketClient.getActivitiesForAgent(agentId)
    }

    suspend fun fetchChatHistory(agentId: String): List<ChatMessage> {
        return webSocketClient.fetchChatHistory(agentId)
    }

    fun updateServerUrl(url: String) {
        webSocketClient.updateServerUrl(url)
    }
}
