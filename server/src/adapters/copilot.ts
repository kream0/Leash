import { BaseAdapter } from './base.js';
import type { Agent } from '../types/index.js';

/**
 * Adapter for GitHub Copilot CLI sessions.
 * Monitors VS Code terminal output.
 */
export class CopilotAdapter extends BaseAdapter {
    public readonly type: Agent['type'] = 'copilot';
    private outputBuffer: string[] = [];

    constructor(id: string) {
        super(id);
    }

    async start(): Promise<void> {
        // TODO: Implement VS Code terminal monitoring
        this.setStatus('active');
        console.log(`[CopilotAdapter] Started monitoring agent ${this.id}`);
    }

    async stop(): Promise<void> {
        this.setStatus('disconnected');
        console.log(`[CopilotAdapter] Stopped monitoring agent ${this.id}`);
    }

    sendInput(message: string): void {
        // TODO: Send input to terminal
        console.log(`[CopilotAdapter] Sending to ${this.id}: ${message}`);
        this.emitActivity(`> ${message}`);
    }

    /**
     * Simulate receiving output (for testing)
     */
    simulateOutput(content: string): void {
        this.outputBuffer.push(content);
        this.emitActivity(content);
    }
}
