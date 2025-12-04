import { WebSocket, WebSocketServer } from 'ws';
import type { IncomingMessage } from 'http';
import type { Agent, ClientMessage, ServerMessage } from '../types/index.js';
import type { AgentManager } from '../agent-manager.js';

/**
 * Handles WebSocket connections for real-time agent activity.
 */
export class WebSocketHandler {
    private wss: WebSocketServer;
    private clients: Set<WebSocket> = new Set();
    private subscriptions: Map<WebSocket, Set<string>> = new Map();

    constructor(private agentManager: AgentManager) {
        this.wss = new WebSocketServer({ noServer: true });
        this.setupEventHandlers();
    }

    private setupEventHandlers(): void {
        // Listen for agent events from manager
        this.agentManager.on('agent_connected', (agent: Agent) => {
            this.broadcast({ type: 'agent_connected', agent });
        });

        this.agentManager.on('agent_disconnected', (agentId: string) => {
            this.broadcast({ type: 'agent_disconnected', agentId });
        });

        this.agentManager.on('activity', (agentId: string, content: string) => {
            this.broadcastToSubscribers(agentId, {
                type: 'activity',
                agentId,
                content,
                timestamp: Date.now(),
            });
        });

        this.agentManager.on('status_change', (agentId: string, status: Agent['status']) => {
            this.broadcast({ type: 'status_change', agentId, status });
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
        this.send(ws, { type: 'agents_list', agents });

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
            case 'send_message':
                this.agentManager.sendMessage(message.agentId, message.message);
                break;

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

    private broadcastToSubscribers(agentId: string, message: ServerMessage): void {
        for (const [client, subs] of this.subscriptions) {
            if (subs.has(agentId) || subs.size === 0) {
                // If no subscriptions, send all; otherwise filter
                this.send(client, message);
            }
        }
    }
}
