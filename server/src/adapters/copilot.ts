import { spawn, ChildProcess } from 'child_process';
import { BaseAdapter } from './base.js';
import type { Agent } from '../types/index.js';
import treeKill from 'tree-kill';

/**
 * Adapter for GitHub Copilot sessions.
 * Spawns VS Code with Copilot and monitors activity.
 */
export class CopilotAdapter extends BaseAdapter {
    public readonly type: Agent['type'] = 'copilot';
    private process: ChildProcess | null = null;
    private outputBuffer: string[] = [];
    private workingDirectory: string;

    constructor(id: string, workingDirectory?: string) {
        super(id);
        this.workingDirectory = workingDirectory || process.cwd();
    }

    async start(): Promise<void> {
        console.log(`[CopilotAdapter] Starting VS Code session in ${this.workingDirectory}`);

        try {
            // Launch VS Code with the current directory
            // Note: This opens VS Code but we can't easily monitor Copilot's internal state
            const isWindows = process.platform === 'win32';

            if (isWindows) {
                this.process = spawn('cmd.exe', ['/c', 'code', '.'], {
                    cwd: this.workingDirectory,
                    stdio: ['pipe', 'pipe', 'pipe'],
                    detached: true
                });
            } else {
                this.process = spawn('code', ['.'], {
                    cwd: this.workingDirectory,
                    stdio: ['pipe', 'pipe', 'pipe'],
                    detached: true
                });
            }

            // Handle stdout
            this.process.stdout?.on('data', (data: Buffer) => {
                const text = data.toString('utf8');
                this.handleOutput(text);
            });

            // Handle stderr
            this.process.stderr?.on('data', (data: Buffer) => {
                const text = data.toString('utf8');
                if (text.trim()) {
                    this.handleOutput(`[vscode] ${text}`);
                }
            });

            // Handle process exit
            this.process.on('exit', (code, signal) => {
                console.log(`[CopilotAdapter] Process exited (code: ${code}, signal: ${signal})`);
                // VS Code launcher exits immediately, so this doesn't mean VS Code closed
                this.process = null;
            });

            // Handle errors
            this.process.on('error', (error) => {
                console.error(`[CopilotAdapter] Process error:`, error);
                this.setStatus('disconnected');
                this.process = null;
            });

            this.setStatus('active');
            console.log(`[CopilotAdapter] Started VS Code for agent ${this.id}`);

            // Note: We can't easily send input to Copilot or monitor its output
            // This would require a VS Code extension or other integration
            this.emitActivity('[Copilot] VS Code launched. Copilot monitoring is limited.');

        } catch (error) {
            console.error(`[CopilotAdapter] Failed to start:`, error);
            this.setStatus('disconnected');
            throw error;
        }
    }

    async stop(): Promise<void> {
        if (this.process && this.process.pid) {
            console.log(`[CopilotAdapter] Stopping agent ${this.id}`);

            return new Promise((resolve) => {
                treeKill(this.process!.pid!, 'SIGTERM', (err) => {
                    if (err) {
                        console.error(`[CopilotAdapter] Error killing process:`, err);
                    }
                    this.process = null;
                    this.setStatus('disconnected');
                    resolve();
                });
            });
        }

        this.setStatus('disconnected');
        console.log(`[CopilotAdapter] Stopped monitoring agent ${this.id}`);
    }

    sendInput(message: string): void {
        // Copilot doesn't accept direct input like Claude Code
        // This would require a VS Code extension integration
        console.log(`[CopilotAdapter] Cannot send direct input to Copilot: ${message.substring(0, 50)}...`);
        this.emitActivity(`[Note] Direct input to Copilot not supported. Use VS Code directly.`);
    }

    private handleOutput(content: string): void {
        const cleaned = this.cleanOutput(content);
        if (cleaned.trim()) {
            this.outputBuffer.push(cleaned);
            this.emitActivity(cleaned);
        }
    }

    private cleanOutput(text: string): string {
        return text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
    }

    getPid(): number | null {
        return this.process?.pid ?? null;
    }

    isRunning(): boolean {
        return this.process !== null && !this.process.killed;
    }

    getRecentOutput(lines: number = 50): string[] {
        return this.outputBuffer.slice(-lines);
    }
}
