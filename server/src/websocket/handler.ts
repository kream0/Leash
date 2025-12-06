import { WebSocket, WebSocketServer } from 'ws';
import type { IncomingMessage } from 'http';
import type { Agent, ClientMessage, ServerMessage, ChatMessageEvent } from '../types/index.js';
import type { AgentManager } from '../agent-manager.js';
import type { TranscriptMessage } from '../transcript-watcher.js';

/**
 * Handles WebSocket connections for real-time agent activity.
 */
export class WebSocketHandler {
    private wss: WebSocketServer;
    private clients: Set<WebSocket> = new Set();
    private subscriptions: Map<WebSocket, Set<string>> = new Map();
    private activityHistory: Map<string, { content: string; timestamp: number }[]> = new Map();
    private chatHistory: Map<string, TranscriptMessage[]> = new Map();
    private readonly MAX_HISTORY = 50;
    private readonly MAX_CHAT_HISTORY = 200;

    constructor(private agentManager: AgentManager) {
        this.wss = new WebSocketServer({ noServer: true });
        this.setupEventHandlers();
    }

    private setupEventHandlers(): void {
        this.agentManager.on('agent_connected', (agent: Agent) => {
            this.broadcast({ type: 'agent_connected', agent });
        });

        this.agentManager.on('agent_disconnected', (agentId: string) => {
            this.broadcast({ type: 'agent_disconnected', agentId });
            this.activityHistory.delete(agentId);
        });

        this.agentManager.on('activity', (agentId: string, content: string) => {
            console.log(`[WebSocket] Activity from ${agentId.substring(0, 8)}: ${content.substring(0, 50)}...`);

            const timestamp = Date.now();
            if (!this.activityHistory.has(agentId)) {
                this.activityHistory.set(agentId, []);
            }
            const history = this.activityHistory.get(agentId)!;
            history.push({ content, timestamp });
            if (history.length > this.MAX_HISTORY) {
                history.shift();
            }

            this.broadcast({
                type: 'activity',
                agentId,
                content,
                timestamp,
            });
        });

        this.agentManager.on('status_change', (agentId: string, status: Agent['status']) => {
            this.broadcast({ type: 'status_change', agentId, status });
        });

        // Handle real-time chat messages from transcript watcher
        this.agentManager.on('chat_message', (agentId: string, message: TranscriptMessage) => {
            console.log(`[WebSocket] Chat message from ${agentId.substring(0, 8)}: ${message.role} - ${message.content.substring(0, 50)}...`);

            // Store in chat history
            if (!this.chatHistory.has(agentId)) {
                this.chatHistory.set(agentId, []);
            }
            const history = this.chatHistory.get(agentId)!;
            history.push(message);
            if (history.length > this.MAX_CHAT_HISTORY) {
                history.shift();
            }

            const chatEvent: ChatMessageEvent = {
                type: 'chat_message',
                agentId,
                message: {
                    role: message.role,
                    content: message.content,
                    timestamp: message.timestamp,
                    uuid: message.uuid
                }
            };

            this.broadcast(chatEvent as unknown as ServerMessage);
        });
    }

    handleUpgrade(request: IncomingMessage, socket: any, head: Buffer): void {
        this.wss.handleUpgrade(request, socket, head, (ws) => {
            this.onConnection(ws);
        });
    }

    private onConnection(ws: WebSocket): void {
        console.log('[WebSocket] Client connected');
        this.clients.add(ws);
        this.subscriptions.set(ws, new Set());

        // Send current agents list
        const agents = this.agentManager.getAgents();
        console.log(`[WebSocket] Sending ${agents.length} agents to client`);
        this.send(ws, { type: 'agents_list', agents });

        // Send recent activity history for all agents
        console.log(`[WebSocket] Sending activity history for ${this.activityHistory.size} agents`);
        for (const [agentId, history] of this.activityHistory) {
            console.log(`[WebSocket] Sending ${history.length} activities for agent ${agentId.substring(0, 8)}...`);
            for (const { content, timestamp } of history) {
                this.send(ws, {
                    type: 'activity',
                    agentId,
                    content,
                    timestamp,
                });
            }
        }

        // Send chat history for all agents
        console.log(`[WebSocket] Sending chat history for ${this.chatHistory.size} agents`);
        for (const [agentId, messages] of this.chatHistory) {
            console.log(`[WebSocket] Sending ${messages.length} chat messages for agent ${agentId.substring(0, 8)}...`);
            for (const message of messages) {
                const chatEvent: ChatMessageEvent = {
                    type: 'chat_message',
                    agentId,
                    message: {
                        role: message.role,
                        content: message.content,
                        timestamp: message.timestamp,
                        uuid: message.uuid
                    }
                };
                this.send(ws, chatEvent as unknown as ServerMessage);
            }
        }

        ws.on('message', (data) => {
            try {
                const message: ClientMessage = JSON.parse(data.toString());
                this.handleMessage(ws, message);
            } catch (error) {
                console.error('[WebSocket] Invalid message:', error);
            }
        });

        ws.on('close', () => {
            console.log('[WebSocket] Client disconnected');
            this.clients.delete(ws);
            this.subscriptions.delete(ws);
        });

        ws.on('error', (error) => {
            console.error('[WebSocket] Error:', error);
        });
    }

    private handleMessage(ws: WebSocket, message: ClientMessage): void {
        switch (message.type) {
            case 'subscribe':
                this.subscriptions.get(ws)?.add(message.agentId);
                break;

            case 'unsubscribe':
                this.subscriptions.get(ws)?.delete(message.agentId);
                break;

            case 'list_agents':
                const agents = this.agentManager.getAgents();
                this.send(ws, { type: 'agents_list', agents });
                break;
        }
    }

    private send(ws: WebSocket, message: ServerMessage): void {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
        }
    }

    private broadcast(message: ServerMessage): void {
        for (const client of this.clients) {
            this.send(client, message);
        }
    }
}
