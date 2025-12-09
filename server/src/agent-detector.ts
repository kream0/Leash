import { EventEmitter } from 'events';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface DetectedProcess {
    type: 'claude-code' | 'copilot' | 'antigravity';
    pid: number;
    command: string;
    workingDirectory?: string;
    isWsl?: boolean;  // True if running inside WSL
}

/**
 * Detects running AI coding agent processes on the local system.
 * Supports detection of processes in both Windows and WSL.
 */
export class AgentDetector extends EventEmitter {
    private scanInterval: NodeJS.Timeout | null = null;
    private knownProcesses: Map<string, DetectedProcess> = new Map(); // key: "type-pid-wsl"

    /**
     * Start periodic scanning for AI agent processes.
     * @param intervalMs How often to scan (default: 5 seconds)
     */
    startScanning(intervalMs: number = 5000): void {
        console.log('[AgentDetector] Starting process scanning (Windows + WSL)...');

        // Initial scan
        this.scan();

        // Periodic scanning
        this.scanInterval = setInterval(() => this.scan(), intervalMs);
    }

    /**
     * Stop periodic scanning.
     */
    stopScanning(): void {
        if (this.scanInterval) {
            clearInterval(this.scanInterval);
            this.scanInterval = null;
        }
        console.log('[AgentDetector] Stopped process scanning');
    }

    /**
     * Scan for running AI agent processes in both Windows and WSL.
     */
    async scan(): Promise<DetectedProcess[]> {
        const detected: DetectedProcess[] = [];

        try {
            // Scan Windows processes
            const windowsProcesses = await this.findWindowsProcesses();
            detected.push(...windowsProcesses);

            // Scan WSL processes
            const wslProcesses = await this.findWslProcesses();
            detected.push(...wslProcesses);

            // Emit events for newly detected processes
            const currentKeys = new Set<string>();
            for (const process of detected) {
                const key = this.processKey(process);
                currentKeys.add(key);

                if (!this.knownProcesses.has(key)) {
                    this.knownProcesses.set(key, process);
                    this.emit('agent_detected', process);
                    const location = process.isWsl ? ' (WSL)' : '';
                    console.log(`[AgentDetector] Detected ${process.type}${location} (PID: ${process.pid})`);
                }
            }

            // Check for terminated processes
            for (const [key, process] of this.knownProcesses) {
                if (!currentKeys.has(key)) {
                    this.knownProcesses.delete(key);
                    this.emit('agent_terminated', process);
                    const location = process.isWsl ? ' (WSL)' : '';
                    console.log(`[AgentDetector] Process terminated${location} (PID: ${process.pid})`);
                }
            }

        } catch (error) {
            console.error('[AgentDetector] Scan error:', error);
        }

        return detected;
    }

    private processKey(p: DetectedProcess): string {
        return `${p.type}-${p.pid}-${p.isWsl ? 'wsl' : 'win'}`;
    }

    /**
     * Find running AI agent processes in Windows.
     * Note: Claude Code detection is disabled - we use hooks instead for reliable activity tracking.
     */
    private async findWindowsProcesses(): Promise<DetectedProcess[]> {
        const processes: DetectedProcess[] = [];

        // Claude Code detection disabled - hooks provide better activity tracking
        // const claudeProcesses = await this.findClaudeCodeWindows();
        // processes.push(...claudeProcesses);

        // Find VS Code (Copilot) processes
        const copilotProcesses = await this.findCopilotWindows();
        processes.push(...copilotProcesses);

        // Antigravity detection disabled - MCP provides better activity tracking
        // const antigravityProcesses = await this.findAntigravityWindows();
        // processes.push(...antigravityProcesses);

        return processes;
    }

    /**
     * Find running Claude Code CLI processes in Windows.
     */
    private async findClaudeCodeWindows(): Promise<DetectedProcess[]> {
        const processes: DetectedProcess[] = [];

        try {
            // Look for claude.exe or node processes running claude
            const { stdout } = await execAsync(
                'wmic process where "name like \'%claude%\' or (name=\'node.exe\' and commandline like \'%claude%\')" get processid,commandline /format:csv',
                { encoding: 'utf8' }
            );

            const lines = stdout.trim().split('\n').filter(line => line.trim());

            for (const line of lines.slice(1)) { // Skip header
                const parts = line.split(',');
                if (parts.length >= 3) {
                    const commandLine = parts.slice(1, -1).join(',');
                    const pid = parseInt(parts[parts.length - 1], 10);

                    if (!isNaN(pid) && pid > 0 && commandLine.toLowerCase().includes('claude')) {
                        processes.push({
                            type: 'claude-code',
                            pid,
                            command: commandLine.trim(),
                            isWsl: false
                        });
                    }
                }
            }
        } catch {
            // Try tasklist fallback
            try {
                const { stdout } = await execAsync('tasklist /fi "imagename eq claude.exe" /fo csv', { encoding: 'utf8' });
                const lines = stdout.trim().split('\n').filter(line => line.trim());

                for (const line of lines.slice(1)) {
                    const match = line.match(/"[^"]+","(\d+)"/);
                    if (match) {
                        processes.push({
                            type: 'claude-code',
                            pid: parseInt(match[1], 10),
                            command: 'claude.exe',
                            isWsl: false
                        });
                    }
                }
            } catch {
                // Ignore
            }
        }

        return processes;
    }

    /**
     * Find running VS Code processes in Windows.
     */
    private async findCopilotWindows(): Promise<DetectedProcess[]> {
        const processes: DetectedProcess[] = [];

        try {
            const { stdout } = await execAsync(
                'tasklist /fi "imagename eq Code.exe" /fo csv',
                { encoding: 'utf8' }
            );

            const lines = stdout.trim().split('\n').filter(line => line.trim());
            let foundFirst = false;

            for (const line of lines.slice(1)) {
                if (!foundFirst) {
                    const match = line.match(/"[^"]+","(\d+)"/);
                    if (match) {
                        processes.push({
                            type: 'copilot',
                            pid: parseInt(match[1], 10),
                            command: 'Code.exe',
                            isWsl: false
                        });
                        foundFirst = true;
                    }
                }
            }
        } catch {
            // Ignore
        }

        return processes;
    }

    /**
     * Find running Antigravity (Google's AI IDE) processes in Windows.
     * Antigravity is a VS Code fork, so process name may be 'antigravity.exe' or similar.
     */
    private async findAntigravityWindows(): Promise<DetectedProcess[]> {
        const processes: DetectedProcess[] = [];

        try {
            // Try to find Antigravity process - it may use various executable names
            const { stdout } = await execAsync(
                'tasklist /fi "imagename eq antigravity.exe" /fo csv',
                { encoding: 'utf8' }
            );

            const lines = stdout.trim().split('\n').filter(line => line.trim());
            let foundFirst = false;

            for (const line of lines.slice(1)) {
                if (!foundFirst) {
                    const match = line.match(/"[^"]+","(\d+)"/);
                    if (match) {
                        processes.push({
                            type: 'antigravity',
                            pid: parseInt(match[1], 10),
                            command: 'antigravity.exe',
                            isWsl: false
                        });
                        foundFirst = true;
                    }
                }
            }
        } catch {
            // Antigravity not found or not installed - ignore
        }

        // Also try "Antigravity" (capital A) as Google might use different naming
        if (processes.length === 0) {
            try {
                const { stdout } = await execAsync(
                    'tasklist /fi "imagename eq Antigravity.exe" /fo csv',
                    { encoding: 'utf8' }
                );

                const lines = stdout.trim().split('\n').filter(line => line.trim());
                let foundFirst = false;

                for (const line of lines.slice(1)) {
                    if (!foundFirst) {
                        const match = line.match(/"[^"]+","(\d+)"/);
                        if (match) {
                            processes.push({
                                type: 'antigravity',
                                pid: parseInt(match[1], 10),
                                command: 'Antigravity.exe',
                                isWsl: false
                            });
                            foundFirst = true;
                        }
                    }
                }
            } catch {
                // Ignore
            }
        }

        return processes;
    }

    /**
     * Find running AI agent processes inside WSL.
     * Note: Claude Code detection is disabled - we use hooks instead for reliable activity tracking.
     */
    private async findWslProcesses(): Promise<DetectedProcess[]> {
        // Claude Code detection disabled - hooks provide better activity tracking
        // WSL Claude Code agents are registered when they send hook events
        return [];
    }

    /**
     * Get list of known running agent processes.
     */
    getKnownProcesses(): DetectedProcess[] {
        return Array.from(this.knownProcesses.values());
    }

    /**
     * Get list of known running agent PIDs.
     */
    getKnownPids(): number[] {
        return this.getKnownProcesses().map(p => p.pid);
    }
}
