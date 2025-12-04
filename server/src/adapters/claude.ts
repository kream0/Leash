import { BaseAdapter } from './base.js';
import type { Agent } from '../types/index.js';

/**
 * Adapter for Claude Code CLI sessions.
 * Monitors terminal output and allows sending input.
 */
export class ClaudeCodeAdapter extends BaseAdapter {
    public readonly type: Agent['type'] = 'claude-code';
    private outputBuffer: string[] = [];

    constructor(id: string) {
        super(id);
    }

    async start(): Promise<void> {
        // TODO: Implement terminal monitoring with node-pty
        // For now, simulate connection
        this.setStatus('active');
        console.log(`[ClaudeCodeAdapter] Started monitoring agent ${this.id}`);
    }

    async stop(): Promise<void> {
        this.setStatus('disconnected');
        console.log(`[ClaudeCodeAdapter] Stopped monitoring agent ${this.id}`);
    }

    sendInput(message: string): void {
        // TODO: Send input to terminal
        console.log(`[ClaudeCodeAdapter] Sending to ${this.id}: ${message}`);
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
