import { EventEmitter } from 'events';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface DetectedProcess {
    type: 'claude-code' | 'copilot';
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
     */
    private async findWindowsProcesses(): Promise<DetectedProcess[]> {
        const processes: DetectedProcess[] = [];

        // Find Claude Code processes
        const claudeProcesses = await this.findClaudeCodeWindows();
        processes.push(...claudeProcesses);

        // Find VS Code (Copilot) processes
        const copilotProcesses = await this.findCopilotWindows();
        processes.push(...copilotProcesses);

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
     * Find running AI agent processes inside WSL.
     */
    private async findWslProcesses(): Promise<DetectedProcess[]> {
        const processes: DetectedProcess[] = [];

        try {
            // Check if WSL is available
            await execAsync('wsl --status', { encoding: 'utf8' });
        } catch {
            // WSL not available or not running
            return processes;
        }

        try {
            // Find Claude Code processes in WSL
            const { stdout } = await execAsync(
                'wsl -e bash -c "ps aux | grep -E \'claude|anthropic\' | grep -v grep"',
                { encoding: 'utf8', timeout: 5000 }
            );

            const lines = stdout.trim().split('\n').filter(line => line.trim());

            for (const line of lines) {
                // ps aux format: USER PID %CPU %MEM VSZ RSS TTY STAT START TIME COMMAND
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 11) {
                    const pid = parseInt(parts[1], 10);
                    const command = parts.slice(10).join(' ');

                    if (!isNaN(pid) && pid > 0) {
                        processes.push({
                            type: 'claude-code',
                            pid,
                            command,
                            isWsl: true
                        });
                    }
                }
            }
        } catch {
            // WSL command failed - maybe no matching processes
        }

        return processes;
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
