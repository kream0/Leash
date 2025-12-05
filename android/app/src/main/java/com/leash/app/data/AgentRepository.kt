package com.leash.app.data

import com.leash.app.model.Agent
import com.leash.app.model.AgentActivity
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow

/** Repository for managing agent data and server communication. */
class AgentRepository(private val webSocketClient: LeashWebSocketClient = LeashWebSocketClient()) {
    val connectionState: StateFlow<ConnectionState> = webSocketClient.connectionState
    val agents: StateFlow<List<Agent>> = webSocketClient.agents
    val activities: SharedFlow<AgentActivity> = webSocketClient.activities
    val activitiesPerAgent: StateFlow<Map<String, List<AgentActivity>>> =
            webSocketClient.activitiesPerAgent

    fun connect() {
        webSocketClient.connect()
    }

    fun disconnect() {
        webSocketClient.disconnect()
    }

    fun sendMessage(agentId: String, message: String) {
        webSocketClient.sendMessage(agentId, message)
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
}
