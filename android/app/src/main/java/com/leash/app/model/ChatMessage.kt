package com.leash.app.model

/**
 * Represents a chat message from the conversation transcript.
 */
data class ChatMessage(
    val role: String, // "user" or "assistant"
    val content: String,
    val timestamp: String
) {
    val isUser: Boolean
        get() = role == "user"
}
