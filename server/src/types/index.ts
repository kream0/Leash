// Agent types
export interface Agent {
    id: string;
    name: string;
    type: 'copilot' | 'claude-code';
    status: 'active' | 'idle' | 'disconnected';
    connectedAt: number;
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
    | { type: 'send_message'; agentId: string; message: string }
    | { type: 'subscribe'; agentId: string }
    | { type: 'unsubscribe'; agentId: string }
    | { type: 'list_agents' };

// Adapter interface
export interface AgentAdapter {
    id: string;
    type: Agent['type'];
    start(): Promise<void>;
    stop(): Promise<void>;
    sendInput(message: string): void;
    onActivity(callback: (content: string) => void): void;
    onStatusChange(callback: (status: Agent['status']) => void): void;
}
