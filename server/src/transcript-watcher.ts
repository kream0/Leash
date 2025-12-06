import { EventEmitter } from 'events';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';

const execAsync = promisify(exec);

export interface TranscriptMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
    uuid: string;
    toolUse?: {
        name: string;
        input?: Record<string, unknown>;
    };
}

interface JsonlEntry {
    type: string;
    uuid: string;
    timestamp: string;
    message?: {
        role: string;
        content: string | Array<{ type: string; text?: string; name?: string; input?: Record<string, unknown> }>;
    };
}

/**
 * Watches a Claude Code transcript file for real-time updates.
 * Parses JSONL entries and emits chat messages as they appear.
 */
export class TranscriptWatcher extends EventEmitter {
    private transcriptPath: string;
    private isWsl: boolean;
    private lastLineCount: number = 0;
    private seenUuids: Set<string> = new Set();
    private watchInterval: NodeJS.Timeout | null = null;
    private agentId: string;

    constructor(agentId: string, transcriptPath: string, isWsl: boolean = false) {
        super();
        this.agentId = agentId;
        this.transcriptPath = transcriptPath;
        this.isWsl = isWsl;
    }

    /**
     * Start watching the transcript file for new messages.
     */
    async startWatching(intervalMs: number = 1000): Promise<void> {
        // Initial read to get current state
        await this.readNewEntries();

        // Poll for changes
        this.watchInterval = setInterval(async () => {
            try {
                await this.readNewEntries();
            } catch (error) {
                console.error(`[TranscriptWatcher] Error reading transcript:`, error);
            }
        }, intervalMs);

        console.log(`[TranscriptWatcher] Started watching: ${this.transcriptPath}`);
    }

    /**
     * Stop watching the transcript file.
     */
    stopWatching(): void {
        if (this.watchInterval) {
            clearInterval(this.watchInterval);
            this.watchInterval = null;
        }
        console.log(`[TranscriptWatcher] Stopped watching: ${this.transcriptPath}`);
    }

    /**
     * Read the transcript file and emit new entries.
     */
    private async readNewEntries(): Promise<void> {
        try {
            let content: string;

            if (this.isWsl) {
                const { stdout } = await execAsync(
                    `wsl -e cat "${this.transcriptPath}"`,
                    { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
                );
                content = stdout;
            } else {
                content = fs.readFileSync(this.transcriptPath, 'utf8');
            }

            const lines = content.trim().split('\n').filter(line => line.trim());

            // Process only new lines
            for (let i = this.lastLineCount; i < lines.length; i++) {
                const line = lines[i];
                try {
                    const entry = JSON.parse(line) as JsonlEntry;
                    this.processEntry(entry);
                } catch {
                    // Skip malformed lines
                }
            }

            this.lastLineCount = lines.length;
        } catch (error) {
            // File might not exist yet or be locked
        }
    }

    /**
     * Process a single JSONL entry and emit appropriate events.
     */
    private processEntry(entry: JsonlEntry): void {
        // Skip if we've already seen this entry
        if (this.seenUuids.has(entry.uuid)) {
            return;
        }
        this.seenUuids.add(entry.uuid);

        // Skip non-message entries
        if (entry.type !== 'user' && entry.type !== 'assistant') {
            return;
        }

        const message = this.parseMessage(entry);
        if (message) {
            this.emit('message', this.agentId, message);
        }
    }

    /**
     * Parse a JSONL entry into a TranscriptMessage.
     */
    private parseMessage(entry: JsonlEntry): TranscriptMessage | null {
        if (!entry.message) {
            return null;
        }

        const role = entry.type as 'user' | 'assistant';
        let content = '';
        let toolUse: TranscriptMessage['toolUse'] | undefined;

        if (typeof entry.message.content === 'string') {
            // User message - content is a string
            content = entry.message.content;
        } else if (Array.isArray(entry.message.content)) {
            // Assistant message - content is an array of blocks
            const textBlocks: string[] = [];

            for (const block of entry.message.content) {
                if (block.type === 'text' && block.text) {
                    textBlocks.push(block.text);
                } else if (block.type === 'tool_use' && block.name) {
                    // Capture tool usage and format it nicely
                    toolUse = {
                        name: block.name,
                        input: block.input
                    };

                    // Format tool use as readable content
                    const toolContent = this.formatToolUse(block.name, block.input);
                    if (toolContent) {
                        textBlocks.push(toolContent);
                    }
                }
            }

            content = textBlocks.join('\n\n');
        }

        // Skip empty messages
        if (!content && !toolUse) {
            return null;
        }

        return {
            role,
            content: content || `[${toolUse?.name}]`,
            timestamp: entry.timestamp,
            uuid: entry.uuid,
            toolUse
        };
    }

    /**
     * Format tool usage into readable content.
     */
    private formatToolUse(toolName: string, input?: Record<string, unknown>): string {
        if (!input) {
            return `🔧 ${toolName}`;
        }

        switch (toolName) {
            case 'Edit': {
                const filePath = input.file_path as string || '';
                const fileName = filePath.split(/[/\\]/).pop() || filePath;
                const oldStr = input.old_string as string || '';
                const newStr = input.new_string as string || '';

                // Create a diff-like display
                let diffContent = `📝 Edit: ${fileName}\n`;
                if (oldStr && newStr) {
                    const oldLines = oldStr.split('\n').map(l => `- ${l}`).join('\n');
                    const newLines = newStr.split('\n').map(l => `+ ${l}`).join('\n');
                    diffContent += `\n${oldLines}\n${newLines}`;
                }
                return diffContent;
            }

            case 'Write': {
                const filePath = input.file_path as string || '';
                const fileName = filePath.split(/[/\\]/).pop() || filePath;
                const content = input.content as string || '';
                const preview = content.length > 500 ? content.substring(0, 500) + '...' : content;
                return `📄 Write: ${fileName}\n\n${preview}`;
            }

            case 'Read': {
                const filePath = input.file_path as string || '';
                const fileName = filePath.split(/[/\\]/).pop() || filePath;
                return `📖 Read: ${fileName}`;
            }

            case 'Bash': {
                const command = input.command as string || '';
                const desc = input.description as string || '';
                return `💻 Bash: ${desc || command}`;
            }

            case 'Grep': {
                const pattern = input.pattern as string || '';
                const path = input.path as string || '.';
                return `🔍 Grep: "${pattern}" in ${path}`;
            }

            case 'Glob': {
                const pattern = input.pattern as string || '';
                return `📂 Glob: ${pattern}`;
            }

            case 'WebFetch': {
                const url = input.url as string || '';
                return `🌐 WebFetch: ${url}`;
            }

            case 'WebSearch': {
                const query = input.query as string || '';
                return `🔎 WebSearch: ${query}`;
            }

            case 'TodoWrite': {
                return `📋 TodoWrite`;
            }

            default:
                return `🔧 ${toolName}`;
        }
    }

    /**
     * Get all messages from the transcript (for initial load).
     */
    async getAllMessages(): Promise<TranscriptMessage[]> {
        const messages: TranscriptMessage[] = [];

        try {
            let content: string;

            if (this.isWsl) {
                const { stdout } = await execAsync(
                    `wsl -e cat "${this.transcriptPath}"`,
                    { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
                );
                content = stdout;
            } else {
                content = fs.readFileSync(this.transcriptPath, 'utf8');
            }

            const lines = content.trim().split('\n').filter(line => line.trim());

            for (const line of lines) {
                try {
                    const entry = JSON.parse(line) as JsonlEntry;
                    if (entry.type === 'user' || entry.type === 'assistant') {
                        const message = this.parseMessage(entry);
                        if (message) {
                            messages.push(message);
                        }
                    }
                } catch {
                    // Skip malformed lines
                }
            }
        } catch (error) {
            console.error(`[TranscriptWatcher] Error reading all messages:`, error);
        }

        return messages;
    }
}
