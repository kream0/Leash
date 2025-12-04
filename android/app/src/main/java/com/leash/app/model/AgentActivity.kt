package com.leash.app.model

/**
 * Represents a single activity entry from an agent.
 */
data class AgentActivity(
    val id: String,
    val agentId: String,
    val content: String,
    val timestamp: Long,
    val type: ActivityType = ActivityType.OUTPUT
)

enum class ActivityType {
    OUTPUT,
    INPUT,
    STATUS
}
