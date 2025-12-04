import { EventEmitter } from 'events';
import type { Agent, AgentAdapter } from '../types/index.js';

/**
 * Base class for agent adapters.
 * Provides common functionality for monitoring AI coding agents.
 */
export abstract class BaseAdapter extends EventEmitter implements AgentAdapter {
    public readonly id: string;
    public abstract readonly type: Agent['type'];
    protected status: Agent['status'] = 'disconnected';

    constructor(id: string) {
        super();
        this.id = id;
    }

    abstract start(): Promise<void>;
    abstract stop(): Promise<void>;
    abstract sendInput(message: string): void;

    onActivity(callback: (content: string) => void): void {
        this.on('activity', callback);
    }

    onStatusChange(callback: (status: Agent['status']) => void): void {
        this.on('status', callback);
    }

    protected emitActivity(content: string): void {
        this.emit('activity', content);
    }

    protected setStatus(status: Agent['status']): void {
        if (this.status !== status) {
            this.status = status;
            this.emit('status', status);
        }
    }

    getStatus(): Agent['status'] {
        return this.status;
    }

    toAgent(): Agent {
        return {
            id: this.id,
            name: `${this.type}-${this.id.slice(0, 8)}`,
            type: this.type,
            status: this.status,
            connectedAt: Date.now(),
        };
    }
}
