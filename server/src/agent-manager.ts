import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type { Agent } from './types/index.js';
import { BaseAdapter, ClaudeCodeAdapter, CopilotAdapter } from './adapters/index.js';
import { AgentDetector, DetectedProcess } from './agent-detector.js';

/**
 * Manages all connected agent adapters.
 * Emits events for agent connections, disconnections, and activity.
 */
export class AgentManager extends EventEmitter {
    private adapters: Map<string, BaseAdapter> = new Map();
    private detector: AgentDetector;
    private autoDetectionEnabled: boolean = false;

    constructor() {
        super();
        this.detector = new AgentDetector();
        this.setupDetectorListeners();
    }

    private setupDetectorListeners(): void {
        this.detector.on('agent_detected', (process: DetectedProcess) => {
            console.log(`[AgentManager] Auto-detected ${process.type} process (PID: ${process.pid})`);
            // Note: We don't auto-attach to existing processes yet
            // This would require more sophisticated process attachment
        });

        this.detector.on('agent_terminated', (process: DetectedProcess) => {
            console.log(`[AgentManager] Process terminated (PID: ${process.pid})`);
            // Find and remove the adapter for this process
            for (const [id, adapter] of this.adapters) {
                if (adapter instanceof ClaudeCodeAdapter || adapter instanceof CopilotAdapter) {
                    if ((adapter as any).getPid?.() === process.pid) {
                        this.removeAgent(id);
                        break;
                    }
                }
            }
        });
    }

    /**
     * Start auto-detecting AI agent processes.
     */
    startAutoDetection(intervalMs: number = 5000): void {
        this.autoDetectionEnabled = true;
        this.detector.startScanning(intervalMs);
        console.log('[AgentManager] Auto-detection started');
    }

    /**
     * Stop auto-detecting AI agent processes.
     */
    stopAutoDetection(): void {
        this.autoDetectionEnabled = false;
        this.detector.stopScanning();
        console.log('[AgentManager] Auto-detection stopped');
    }

    /**
     * Get detected but not yet connected processes.
     */
    getDetectedProcesses(): number[] {
        return this.detector.getKnownPids();
    }

    /**
     * Create and register a new Claude Code agent adapter.
     * @param options Configuration for the Claude Code session
     */
    async addClaudeCodeAgent(options?: { workingDirectory?: string; useWsl?: boolean }): Promise<Agent> {
        const id = randomUUID();
        const adapter = new ClaudeCodeAdapter(id, options);

        this.setupAdapterListeners(adapter);
        this.adapters.set(id, adapter);

        await adapter.start();
        const agent = adapter.toAgent();
        this.emit('agent_connected', agent);

        return agent;
    }

    /**
     * Register or get a hooks-based agent (for Claude Code hooks integration).
     * These agents don't have adapters - they receive events via HTTP hooks.
     */
    getOrCreateHooksAgent(agentId: string): Agent {
        let adapter = this.adapters.get(agentId);
        if (!adapter) {
            // Create a virtual agent for hooks
            const agent: Agent = {
                id: agentId,
                name: `hooks-${agentId.substring(0, 8)}`,
                type: 'claude-code',
                status: 'active',
                connectedAt: Date.now()
            };
            this.emit('agent_connected', agent);
            return agent;
        }
        return adapter.toAgent();
    }

    /**
     * Create and register a new Copilot agent adapter.
     * @param workingDirectory Optional directory to open VS Code in
     */
    async addCopilotAgent(workingDirectory?: string): Promise<Agent> {
        const id = randomUUID();
        const adapter = new CopilotAdapter(id, workingDirectory);

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
        this.stopAutoDetection();

        for (const adapter of this.adapters.values()) {
            await adapter.stop();
        }
        this.adapters.clear();
    }
}
