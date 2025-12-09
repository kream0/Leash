// Agent types
export interface Agent {
    id: string;
    name: string;
    type: 'copilot' | 'claude-code' | 'antigravity';
    status: 'active' | 'idle' | 'disconnected';
    connectedAt: number;
    pid?: number;
    isWsl?: boolean;
    transcriptPath?: string;  // Path to the session transcript file
}

// Chat message from transcript
export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
    uuid?: string;
}

// Real-time chat message event
export interface ChatMessageEvent {
    type: 'chat_message';
    agentId: string;
    message: ChatMessage;
}

export interface AgentActivity {
    id: string;
    agentId: string;
    content: string;
    timestamp: number;
    type: 'output' | 'input' | 'status';
}

// WebSocket message types
export type ServerMessage =
    | { type: 'agent_connected'; agent: Agent }
    | { type: 'agent_disconnected'; agentId: string }
    | { type: 'activity'; agentId: string; content: string; timestamp: number }
    | { type: 'status_change'; agentId: string; status: Agent['status'] }
    | { type: 'agents_list'; agents: Agent[] };

export type ClientMessage =
    | { type: 'subscribe'; agentId: string }
    | { type: 'unsubscribe'; agentId: string }
    | { type: 'list_agents' }
    | { type: 'send_message'; agentId: string; message: string; instant?: boolean }
    | { type: 'interrupt'; agentId: string };
