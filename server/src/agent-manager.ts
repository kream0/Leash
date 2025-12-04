import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type { Agent } from './types/index.js';
import { BaseAdapter, ClaudeCodeAdapter, CopilotAdapter } from './adapters/index.js';

/**
 * Manages all connected agent adapters.
 * Emits events for agent connections, disconnections, and activity.
 */
export class AgentManager extends EventEmitter {
    private adapters: Map<string, BaseAdapter> = new Map();

    /**
     * Create and register a new Claude Code agent adapter.
     */
    async addClaudeCodeAgent(): Promise<Agent> {
        const id = randomUUID();
        const adapter = new ClaudeCodeAdapter(id);

        this.setupAdapterListeners(adapter);
        this.adapters.set(id, adapter);

        await adapter.start();
        const agent = adapter.toAgent();
        this.emit('agent_connected', agent);

        return agent;
    }

    /**
     * Create and register a new Copilot agent adapter.
     */
    async addCopilotAgent(): Promise<Agent> {
        const id = randomUUID();
        const adapter = new CopilotAdapter(id);

        this.setupAdapterListeners(adapter);
        this.adapters.set(id, adapter);

        await adapter.start();
        const agent = adapter.toAgent();
        this.emit('agent_connected', agent);

        return agent;
    }

    private setupAdapterListeners(adapter: BaseAdapter): void {
        adapter.onActivity((content) => {
            this.emit('activity', adapter.id, content);
        });

        adapter.onStatusChange((status) => {
            this.emit('status_change', adapter.id, status);
        });
    }

    /**
     * Get all connected agents.
     */
    getAgents(): Agent[] {
        return Array.from(this.adapters.values()).map((a) => a.toAgent());
    }

    /**
     * Get a specific agent by ID.
     */
    getAgent(id: string): Agent | undefined {
        return this.adapters.get(id)?.toAgent();
    }

    /**
     * Send a message to an agent.
     */
    sendMessage(id: string, message: string): boolean {
        const adapter = this.adapters.get(id);
        if (!adapter) return false;

        adapter.sendInput(message);
        return true;
    }

    /**
     * Remove and stop an agent.
     */
    async removeAgent(id: string): Promise<boolean> {
        const adapter = this.adapters.get(id);
        if (!adapter) return false;

        await adapter.stop();
        this.adapters.delete(id);
        this.emit('agent_disconnected', id);

        return true;
    }

    /**
     * Stop all agents.
     */
    async stopAll(): Promise<void> {
        for (const adapter of this.adapters.values()) {
            await adapter.stop();
        }
        this.adapters.clear();
    }
}
