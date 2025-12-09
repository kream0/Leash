import { EventEmitter } from 'events';
import type { Agent } from './types/index.js';
import { AgentDetector, DetectedProcess } from './agent-detector.js';
import { TranscriptWatcher, TranscriptMessage } from './transcript-watcher.js';

/**
 * Manages all detected AI coding agents.
 * Emits events for agent connections, disconnections, and activity.
 */
export class AgentManager extends EventEmitter {
    private agents: Map<string, Agent> = new Map();
    private activityHistory: Map<string, string[]> = new Map();
    private transcriptWatchers: Map<string, TranscriptWatcher> = new Map();
    private detector: AgentDetector;
    private autoDetectionEnabled: boolean = false;

    constructor() {
        super();
        this.detector = new AgentDetector();
        this.setupDetectorListeners();
    }

    private processToAgentId(process: DetectedProcess): string {
        // Create stable ID from process info
        return `${process.type}-${process.isWsl ? 'wsl' : 'win'}-${process.pid}`;
    }

    private setupDetectorListeners(): void {
        this.detector.on('agent_detected', (process: DetectedProcess) => {
            const id = this.processToAgentId(process);

            if (!this.agents.has(id)) {
                const agent: Agent = {
                    id,
                    name: `${process.type}${process.isWsl ? ' (WSL)' : ''} - PID ${process.pid}`,
                    type: process.type,
                    status: 'active',
                    connectedAt: Date.now(),
                    pid: process.pid,
                    isWsl: process.isWsl
                };

                this.agents.set(id, agent);
                this.activityHistory.set(id, []);
                this.emit('agent_connected', agent);
                console.log(`[AgentManager] Registered agent: ${agent.name}`);
            }
        });

        this.detector.on('agent_terminated', (process: DetectedProcess) => {
            const id = this.processToAgentId(process);
            const agent = this.agents.get(id);

            if (agent) {
                agent.status = 'disconnected';
                this.agents.delete(id);
                this.emit('agent_disconnected', id);
                console.log(`[AgentManager] Agent terminated: ${agent.name}`);
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
     * Get or create an agent by ID (for hooks integration).
     * If agent doesn't exist, creates a hooks-based agent.
     * Agent type is determined from the agentId prefix or source parameter.
     */
    getOrCreateHooksAgent(agentId: string, transcriptPath?: string, source?: string): Agent {
        let agent = this.agents.get(agentId);
        if (!agent) {
            // Parse the agent ID to determine if it's WSL or Windows
            const isWsl = agentId.includes('wsl');
            const location = isWsl ? ' (WSL)' : '';

            // Determine agent type from source or agentId prefix
            let agentType: 'claude-code' | 'copilot' | 'antigravity' = 'claude-code';
            let agentName = 'Claude Code';

            if (source) {
                // Explicit source provided
                if (source === 'antigravity') {
                    agentType = 'antigravity';
                    agentName = 'Antigravity';
                } else if (source === 'copilot') {
                    agentType = 'copilot';
                    agentName = 'Copilot';
                } else if (source === 'claude-code' || source === 'claude') {
                    agentType = 'claude-code';
                    agentName = 'Claude Code';
                }
            } else {
                // Infer from agentId prefix
                const lowerAgentId = agentId.toLowerCase();
                if (lowerAgentId.startsWith('antigravity')) {
                    agentType = 'antigravity';
                    agentName = 'Antigravity';
                } else if (lowerAgentId.startsWith('copilot')) {
                    agentType = 'copilot';
                    agentName = 'Copilot';
                }
            }

            agent = {
                id: agentId,
                name: `${agentName}${location}`,
                type: agentType,
                status: 'active',
                connectedAt: Date.now(),
                isWsl,
                transcriptPath
            };
            this.agents.set(agentId, agent);
            this.activityHistory.set(agentId, []);
            this.emit('agent_connected', agent);
            console.log(`[AgentManager] Registered hook agent: ${agent.name} (${agentId})`);

            // Start transcript watcher if we have a path
            if (transcriptPath) {
                this.startTranscriptWatcher(agentId, transcriptPath, isWsl);
            }
        } else if (transcriptPath && !agent.transcriptPath) {
            // Update transcript path if we didn't have it before
            agent.transcriptPath = transcriptPath;
            this.startTranscriptWatcher(agentId, transcriptPath, agent.isWsl || false);
        }
        return agent;
    }

    /**
     * Start watching a transcript file for real-time updates.
     */
    private startTranscriptWatcher(agentId: string, transcriptPath: string, isWsl: boolean): void {
        // Don't start if already watching
        if (this.transcriptWatchers.has(agentId)) {
            return;
        }

        const watcher = new TranscriptWatcher(agentId, transcriptPath, isWsl);

        watcher.on('message', (id: string, message: TranscriptMessage) => {
            console.log(`[TranscriptWatcher] New message from ${id}: ${message.role} - ${message.content.substring(0, 50)}...`);
            this.emit('chat_message', id, message);
        });

        watcher.startWatching(1000); // Poll every 1 second
        this.transcriptWatchers.set(agentId, watcher);
        console.log(`[AgentManager] Started transcript watcher for ${agentId}`);
    }

    /**
     * Stop watching a transcript file.
     */
    private stopTranscriptWatcher(agentId: string): void {
        const watcher = this.transcriptWatchers.get(agentId);
        if (watcher) {
            watcher.stopWatching();
            this.transcriptWatchers.delete(agentId);
        }
    }

    /**
     * Get all messages from an agent's transcript.
     */
    async getTranscriptMessages(agentId: string): Promise<TranscriptMessage[]> {
        const agent = this.agents.get(agentId);
        if (!agent?.transcriptPath) {
            return [];
        }

        const watcher = new TranscriptWatcher(agentId, agent.transcriptPath, agent.isWsl || false);
        return watcher.getAllMessages();
    }

    /**
     * Record activity for an agent.
     */
    recordActivity(agentId: string, content: string): void {
        const history = this.activityHistory.get(agentId) || [];
        history.push(content);
        // Keep last 100 activities per agent
        if (history.length > 100) {
            history.shift();
        }
        this.activityHistory.set(agentId, history);
    }

    /**
     * Get activity history for an agent.
     */
    getActivityHistory(agentId: string): string[] {
        return this.activityHistory.get(agentId) || [];
    }

    /**
     * Get all connected agents.
     */
    getAgents(): Agent[] {
        return Array.from(this.agents.values());
    }

    /**
     * Get a specific agent by ID.
     */
    getAgent(id: string): Agent | undefined {
        return this.agents.get(id);
    }

    /**
     * Stop all monitoring.
     */
    async stopAll(): Promise<void> {
        this.stopAutoDetection();

        // Stop all transcript watchers
        for (const [agentId] of this.transcriptWatchers) {
            this.stopTranscriptWatcher(agentId);
        }

        this.agents.clear();
        this.activityHistory.clear();
    }
}
