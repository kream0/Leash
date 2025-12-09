package com.leash.app.model

/**
 * Represents an AI coding agent.
 */
data class Agent(
    val id: String,
    val name: String,
    val type: AgentType,
    val status: AgentStatus,
    val connectedAt: Long
)

enum class AgentType {
    COPILOT,
    CLAUDE_CODE,
    ANTIGRAVITY;

    val displayName: String
        get() = when (this) {
            COPILOT -> "GitHub Copilot"
            CLAUDE_CODE -> "Claude Code"
            ANTIGRAVITY -> "Antigravity"
        }

    companion object {
        fun fromString(value: String): AgentType = when (value) {
            "copilot" -> COPILOT
            "claude-code" -> CLAUDE_CODE
            "antigravity" -> ANTIGRAVITY
            else -> CLAUDE_CODE
        }
    }
}

enum class AgentStatus {
    ACTIVE,
    IDLE,
    DISCONNECTED;

    companion object {
        fun fromString(value: String): AgentStatus = when (value) {
            "active" -> ACTIVE
            "idle" -> IDLE
            "disconnected" -> DISCONNECTED
            else -> DISCONNECTED
        }
    }
}
