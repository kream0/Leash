import { spawn, ChildProcess, exec } from 'child_process';
import { watch, readFile, existsSync, mkdirSync, writeFileSync } from 'fs';
import { promisify } from 'util';
import { BaseAdapter } from './base.js';
import type { Agent } from '../types/index.js';
import treeKill from 'tree-kill';

const readFileAsync = promisify(readFile);
const execAsync = promisify(exec);

export interface ClaudeCodeOptions {
    workingDirectory?: string;
    useWsl?: boolean;
}

const WSL_LOG_FILE = '/tmp/leash/claude-output.log';
const WINDOWS_WATCH_PATH = '\\\\wsl$\\Ubuntu\\tmp\\leash\\claude-output.log';

/**
 * Adapter for Claude Code CLI sessions.
 * Spawns Claude Code inside WSL with terminal output capture.
 */
export class ClaudeCodeAdapter extends BaseAdapter {
    public readonly type: Agent['type'] = 'claude-code';
    private process: ChildProcess | null = null;
    private outputBuffer: string[] = [];
    private workingDirectory: string;
    private useWsl: boolean;
    private lastLogSize: number = 0;
    private fileWatcher: ReturnType<typeof watch> | null = null;
    private pollInterval: NodeJS.Timeout | null = null;

    constructor(id: string, options?: ClaudeCodeOptions) {
        super(id);
        this.workingDirectory = options?.workingDirectory || process.cwd();
        this.useWsl = options?.useWsl ?? true; // Default to WSL for better output capture
    }

    async start(): Promise<void> {
        console.log(`[ClaudeCodeAdapter] Starting Claude Code session in ${this.workingDirectory}`);

        try {
            if (this.useWsl) {
                await this.startWithWslCapture();
            } else {
                await this.startWindows();
            }

            this.setStatus('active');

            // Emit initial activity after a delay
            setTimeout(() => {
                const location = this.useWsl ? 'WSL' : 'Windows';
                this.emitActivity(`🚀 Connected to Claude Code (${location})`);
                this.emitActivity(`📁 ${this.workingDirectory}`);
            }, 500);

        } catch (error) {
            console.error(`[ClaudeCodeAdapter] Failed to start:`, error);
            this.setStatus('disconnected');
            throw error;
        }
    }

    /**
     * Start Claude Code in WSL using script command for output capture.
     * Then watch the log file for changes.
     */
    private async startWithWslCapture(): Promise<void> {
        console.log(`[ClaudeCodeAdapter] Starting with WSL output capture...`);

        // Convert Windows path to WSL path
        const wslPath = this.toWslPath(this.workingDirectory);

        // Create log directory in WSL
        await execAsync('wsl -e bash -c "mkdir -p /tmp/leash && > /tmp/leash/claude-output.log"');

        // Start Claude Code in WSL with script command for output capture
        // script -q -f captures output and flushes immediately
        const scriptCmd = `cd "${wslPath}" && script -q -f ${WSL_LOG_FILE} -c "claude"`;

        this.process = spawn('wsl', ['-e', 'bash', '-c', scriptCmd], {
            stdio: ['pipe', 'pipe', 'pipe'],
            detached: false
        });

        console.log(`[ClaudeCodeAdapter] Started WSL process (PID: ${this.process.pid})`);

        // Handle process events
        this.process.on('exit', (code, signal) => {
            console.log(`[ClaudeCodeAdapter] Process exited (code: ${code}, signal: ${signal})`);
            this.stopWatching();
            this.setStatus('disconnected');
            this.process = null;
        });

        this.process.on('error', (error) => {
            console.error(`[ClaudeCodeAdapter] Process error:`, error);
            this.stopWatching();
            this.setStatus('disconnected');
            this.process = null;
        });

        // Start watching the log file for changes
        await this.startWatchingLogFile();
    }

    /**
     * Watch the WSL log file for changes and emit activities.
     */
    private async startWatchingLogFile(): Promise<void> {
        console.log(`[ClaudeCodeAdapter] Watching log file: ${WINDOWS_WATCH_PATH}`);

        // Give script command a moment to create the file
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Poll the log file for changes (more reliable than fs.watch across WSL boundary)
        this.pollInterval = setInterval(async () => {
            try {
                const content = await readFileAsync(WINDOWS_WATCH_PATH, 'utf8');
                const newContent = content.substring(this.lastLogSize);

                if (newContent.length > 0) {
                    this.lastLogSize = content.length;
                    this.handleLogOutput(newContent);
                }
            } catch (error) {
                // File may not exist yet, that's OK
            }
        }, 500); // Check every 500ms
    }

    private stopWatching(): void {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
        if (this.fileWatcher) {
            this.fileWatcher.close();
            this.fileWatcher = null;
        }
    }

    /**
     * Handle new output from the log file.
     */
    private handleLogOutput(content: string): void {
        // Clean the output (remove ANSI codes and split into lines)
        const cleaned = this.cleanOutput(content);
        const lines = cleaned.split('\n').filter(line => line.trim());

        for (const line of lines) {
            // Skip empty lines and script command noise
            if (line.trim() && !line.includes('Script started') && !line.includes('Script done')) {
                this.outputBuffer.push(line);
                this.emitActivity(line);

                // Detect activity patterns
                if (this.isThinking(line)) {
                    this.setStatus('active');
                }
            }
        }
    }

    /**
     * Start Claude Code on Windows (fallback, limited output capture).
     */
    private async startWindows(): Promise<void> {
        console.log(`[ClaudeCodeAdapter] Starting on Windows (limited output capture)...`);

        this.process = spawn('cmd.exe', ['/c', 'claude'], {
            cwd: this.workingDirectory,
            env: { ...process.env, FORCE_COLOR: '0' },
            stdio: ['pipe', 'pipe', 'pipe']
        });

        this.process.stdout?.on('data', (data: Buffer) => {
            const text = data.toString('utf8');
            this.handleOutput(text);
        });

        this.process.stderr?.on('data', (data: Buffer) => {
            const text = data.toString('utf8');
            this.handleOutput(`[stderr] ${text}`);
        });

        this.process.on('exit', (code, signal) => {
            console.log(`[ClaudeCodeAdapter] Process exited (code: ${code}, signal: ${signal})`);
            this.setStatus('disconnected');
            this.process = null;
        });

        this.process.on('error', (error) => {
            console.error(`[ClaudeCodeAdapter] Process error:`, error);
            this.setStatus('disconnected');
            this.process = null;
        });

        console.log(`[ClaudeCodeAdapter] Started Windows process (PID: ${this.process.pid})`);
    }

    /**
     * Convert Windows path to WSL path format.
     */
    private toWslPath(windowsPath: string): string {
        if (windowsPath.startsWith('\\\\')) {
            return windowsPath;
        }

        const match = windowsPath.match(/^([A-Za-z]):(.*)/);
        if (match) {
            const drive = match[1].toLowerCase();
            const rest = match[2].replace(/\\/g, '/');
            return `/mnt/${drive}${rest}`;
        }

        return windowsPath.replace(/\\/g, '/');
    }

    async stop(): Promise<void> {
        this.stopWatching();

        if (this.process && this.process.pid) {
            console.log(`[ClaudeCodeAdapter] Stopping agent ${this.id}`);

            return new Promise((resolve) => {
                treeKill(this.process!.pid!, 'SIGTERM', (err) => {
                    if (err) {
                        console.error(`[ClaudeCodeAdapter] Error killing process:`, err);
                    }
                    this.process = null;
                    this.setStatus('disconnected');
                    resolve();
                });
            });
        }

        this.setStatus('disconnected');
    }

    sendInput(message: string): void {
        if (this.process && this.process.stdin) {
            console.log(`[ClaudeCodeAdapter] Sending input: ${message.substring(0, 50)}...`);
            this.process.stdin.write(message + '\n');
            this.emitActivity(`> ${message}`);
        } else {
            console.warn(`[ClaudeCodeAdapter] Cannot send input - process not running`);
        }
    }

    private handleOutput(content: string): void {
        const cleaned = this.cleanOutput(content);
        if (cleaned.trim()) {
            this.outputBuffer.push(cleaned);
            this.emitActivity(cleaned);

            if (this.isThinking(cleaned)) {
                this.setStatus('active');
            }
        }
    }

    private cleanOutput(text: string): string {
        // Remove ANSI escape codes
        return text
            .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
            .replace(/\x1B\]0;[^\x07]*\x07/g, '') // Window title sequences
            .replace(/\r/g, ''); // Carriage returns
    }

    private isThinking(text: string): boolean {
        const thinkingPatterns = [
            'Thinking...',
            'Analyzing...',
            'Processing...',
            '⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'
        ];
        return thinkingPatterns.some(pattern => text.includes(pattern));
    }

    getPid(): number | null {
        return this.process?.pid ?? null;
    }

    isWslMode(): boolean {
        return this.useWsl;
    }

    isRunning(): boolean {
        return this.process !== null && !this.process.killed;
    }

    getRecentOutput(lines: number = 50): string[] {
        return this.outputBuffer.slice(-lines);
    }
}
