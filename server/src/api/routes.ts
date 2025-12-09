import { Router, type Request, type Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { AgentManager } from '../agent-manager.js';
import type { ChatMessage } from '../types/index.js';

const execAsync = promisify(exec);

// Get the directory of this file for locating scripts
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCRIPTS_DIR = path.resolve(__dirname, '../../scripts');

// Message queue for each agent (messages sent from mobile to be injected)
const messageQueues: Map<string, string[]> = new Map();

/**
 * Read chat history from a transcript file.
 * Supports both local files and WSL paths.
 */
async function readTranscript(transcriptPath: string, isWsl: boolean): Promise<ChatMessage[]> {
    const messages: ChatMessage[] = [];

    try {
        let content: string;

        if (isWsl) {
            // Read file from WSL
            const { stdout } = await execAsync(`wsl -e cat "${transcriptPath}"`, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
            content = stdout;
        } else {
            // Read local file
            content = fs.readFileSync(transcriptPath, 'utf8');
        }

        const lines = content.trim().split('\n');

        for (const line of lines) {
            if (!line.trim()) continue;

            try {
                const entry = JSON.parse(line);

                // User message
                if (entry.type === 'user' && entry.message?.content) {
                    messages.push({
                        role: 'user',
                        content: typeof entry.message.content === 'string'
                            ? entry.message.content
                            : JSON.stringify(entry.message.content),
                        timestamp: entry.timestamp
                    });
                }

                // Assistant message
                if (entry.type === 'assistant' && entry.message?.content) {
                    const textContent = entry.message.content
                        .filter((c: { type: string }) => c.type === 'text')
                        .map((c: { text: string }) => c.text)
                        .join('');

                    if (textContent) {
                        messages.push({
                            role: 'assistant',
                            content: textContent,
                            timestamp: entry.timestamp
                        });
                    }
                }
            } catch (e) {
                // Skip malformed lines
            }
        }
    } catch (error) {
        console.error('[Routes] Error reading transcript:', error);
    }

    return messages;
}

/**
 * Creates Express routes for the REST API.
 */
export function createRoutes(agentManager: AgentManager, password?: string): Router {
    const router = Router();

    // Authentication middleware
    const authMiddleware = (req: Request, res: Response, next: Function) => {
        if (password) {
            const authHeader = req.headers.authorization;
            if (authHeader !== password) {
                console.log('[Routes] Authentication failed - invalid or missing Authorization header');
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }
        }
        next();
    };

    // Apply authentication to all routes
    router.use(authMiddleware);

    // GET /api/agents - List all detected agents
    router.get('/agents', (_req: Request, res: Response) => {
        const agents = agentManager.getAgents();
        res.json({ agents });
    });

    // GET /api/agents/:id - Get agent details
    router.get('/agents/:id', (req: Request, res: Response) => {
        const agent = agentManager.getAgent(req.params.id);
        if (!agent) {
            res.status(404).json({ error: 'Agent not found' });
            return;
        }
        res.json({ agent, activity: agentManager.getActivityHistory(req.params.id) });
    });

    // GET /api/agents/:id/chat - Get agent activity as chat messages
    router.get('/agents/:id/chat', (req: Request, res: Response) => {
        const agent = agentManager.getAgent(req.params.id);
        if (!agent) {
            res.status(404).json({ error: 'Agent not found' });
            return;
        }

        const activity = agentManager.getActivityHistory(req.params.id);
        const messages = activity.map((content, index) => ({
            role: content.includes('User:') ? 'user' : 'assistant',
            content: content,
            timestamp: new Date(Date.now() - (activity.length - index) * 1000).toISOString()
        }));

        res.json({ messages });
    });

    // GET /api/health - Health check
    router.get('/health', (_req: Request, res: Response) => {
        res.json({ status: 'ok', timestamp: Date.now() });
    });

    // POST /api/hooks - Receive Claude Code hook events
    router.post('/hooks', (req: Request, res: Response) => {
        const { type, eventType, agentId, data } = req.body;

        if (type !== 'hook_event') {
            res.status(400).json({ error: 'Invalid hook event type' });
            return;
        }

        console.log(`[Hooks] Received ${eventType} from ${agentId}`);

        // Format activity message based on event type
        let activityMessage = '';
        switch (eventType) {
            case 'SessionStart':
                activityMessage = '🚀 Session started';
                break;
            case 'UserPromptSubmit':
                activityMessage = `📝 User: ${data?.prompt?.substring(0, 100) || 'prompt'}`;
                break;
            case 'PreToolUse':
                activityMessage = `🔧 ${data?.tool_name || data?.name || 'tool'}`;
                break;
            case 'PostToolUse':
                const toolName = data?.tool_name || data?.name || 'tool';
                const status = data?.error ? '❌' : '✅';
                activityMessage = `${status} ${toolName}`;
                break;
            case 'Notification':
                activityMessage = `📣 ${data?.message || data?.content || 'notification'}`;
                break;
            case 'Stop':
                // Stop fires when assistant finishes responding
                // If we have the assistant's response from transcript, show it
                if (data?.assistant_response) {
                    const response = data.assistant_response.substring(0, 150);
                    activityMessage = `🤖 Claude: ${response}${data.assistant_response.length > 150 ? '...' : ''}`;
                } else {
                    activityMessage = '✓ Response complete';
                }
                break;
            default:
                activityMessage = `${eventType}`;
        }

        // Get or create agent for this hook source (pass transcript path)
        const transcriptPath = data?.transcript_path;
        const agent = agentManager.getOrCreateHooksAgent(agentId, transcriptPath);
        agentManager.recordActivity(agent.id, activityMessage);
        agentManager.emit('activity', agent.id, activityMessage);

        res.json({ success: true, received: eventType });
    });

    // GET /api/agents/:id/chat - Get full chat history for an agent
    router.get('/agents/:id/chat', async (req: Request, res: Response) => {
        const agent = agentManager.getAgent(req.params.id);
        if (!agent) {
            res.status(404).json({ error: 'Agent not found' });
            return;
        }

        if (!agent.transcriptPath) {
            res.json({ messages: [], error: 'No transcript available' });
            return;
        }

        try {
            const messages = await readTranscript(agent.transcriptPath, agent.isWsl || false);
            res.json({ messages });
        } catch (error) {
            console.error('[Routes] Error fetching chat:', error);
            res.status(500).json({ error: 'Failed to read chat history' });
        }
    });

    // POST /api/agents/:id/send - Send a message to Claude Code
    // Options:
    //   - instant: true  -> Paste directly into terminal (immediate)
    //   - instant: false -> Queue for hook injection (default, waits for next hook)
    router.post('/agents/:id/send', async (req: Request, res: Response) => {
        const agent = agentManager.getAgent(req.params.id);
        if (!agent) {
            res.status(404).json({ error: 'Agent not found' });
            return;
        }

        const { message, instant = false } = req.body;
        if (!message || typeof message !== 'string') {
            res.status(400).json({ error: 'Message is required' });
            return;
        }

        // Instant mode: Copy to clipboard and paste into Claude's terminal
        if (instant) {
            try {
                // Use external PowerShell script to avoid escaping issues
                const scriptPath = path.join(SCRIPTS_DIR, 'send-to-claude.ps1');
                // Escape the message for PowerShell: escape double quotes and backticks
                const escapedMessage = message.replace(/"/g, '\\"').replace(/`/g, '``');
                const command = `powershell -ExecutionPolicy Bypass -File "${scriptPath}" -Message "${escapedMessage}"`;

                console.log(`[Routes] Running instant send script for ${agent.id}`);
                const { stdout, stderr } = await execAsync(command, { encoding: 'utf8' });

                if (stderr) {
                    console.error('[Routes] Script stderr:', stderr);
                }
                if (stdout) {
                    console.log('[Routes] Script stdout:', stdout);
                }

                const activityMessage = `📤 Instant message sent: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}"`;
                agentManager.recordActivity(agent.id, activityMessage);
                agentManager.emit('activity', agent.id, activityMessage);

                console.log(`[Routes] Instant message sent to ${agent.id}: ${message.substring(0, 50)}...`);

                res.json({
                    success: true,
                    message: 'Message sent instantly to Claude terminal.',
                    method: 'instant'
                });
            } catch (error) {
                console.error('[Routes] Error sending instant message:', error);
                res.status(500).json({
                    error: 'Failed to send instant message',
                    details: error instanceof Error ? error.message : 'Unknown error'
                });
            }
            return;
        }

        // Queue mode (default): Add to queue for hook injection
        if (!messageQueues.has(agent.id)) {
            messageQueues.set(agent.id, []);
        }
        messageQueues.get(agent.id)!.push(message);

        // Log and emit activity
        const queueSize = messageQueues.get(agent.id)!.length;
        const activityMessage = `📨 Message queued (${queueSize} in queue): "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}"`;
        agentManager.recordActivity(agent.id, activityMessage);
        agentManager.emit('activity', agent.id, activityMessage);

        console.log(`[Routes] Message queued for ${agent.id}: ${message.substring(0, 50)}...`);

        res.json({
            success: true,
            message: 'Message queued. Will be sent when Claude finishes current task.',
            method: 'queued',
            queueSize
        });
    });

    // GET /api/agents/:id/queue - Get pending messages for an agent (called by Stop hook)
    router.get('/agents/:id/queue', (req: Request, res: Response) => {
        const agentId = req.params.id;
        const queue = messageQueues.get(agentId) || [];

        if (queue.length > 0) {
            // Pop the first message
            const message = queue.shift()!;
            console.log(`[Routes] Dequeued message for ${agentId}: ${message.substring(0, 50)}...`);
            res.json({ hasMessage: true, message, remainingCount: queue.length });
        } else {
            res.json({ hasMessage: false, message: null, remainingCount: 0 });
        }
    });

    // GET /api/agents/:id/queue/peek - Peek at queue without removing (for UI)
    router.get('/agents/:id/queue/peek', (req: Request, res: Response) => {
        const agentId = req.params.id;
        const queue = messageQueues.get(agentId) || [];
        res.json({ count: queue.length, messages: queue });
    });

    // POST /api/agents/:id/interrupt - Send interrupt signal (ESC) to Claude Code
    router.post('/agents/:id/interrupt', async (req: Request, res: Response) => {
        const agent = agentManager.getAgent(req.params.id);
        if (!agent) {
            res.status(404).json({ error: 'Agent not found' });
            return;
        }

        try {
            // Use dedicated PowerShell script to send ESC key to Claude window
            const scriptPath = path.join(SCRIPTS_DIR, 'interrupt-claude.ps1');
            const command = `powershell -ExecutionPolicy Bypass -File "${scriptPath}"`;

            console.log(`[Routes] Running interrupt script for ${agent.id}`);
            const { stdout, stderr } = await execAsync(command, { encoding: 'utf8' });

            if (stderr) {
                console.error('[Routes] Interrupt script stderr:', stderr);
            }
            if (stdout) {
                console.log('[Routes] Interrupt script stdout:', stdout);
            }

            const activityMessage = '⛔ Interrupt signal sent';
            agentManager.recordActivity(agent.id, activityMessage);
            agentManager.emit('activity', agent.id, activityMessage);

            console.log(`[Routes] Interrupt sent for ${agent.id}`);

            res.json({ success: true, message: 'Interrupt signal sent' });
        } catch (error) {
            console.error('[Routes] Error sending interrupt:', error);
            res.status(500).json({
                error: 'Failed to send interrupt',
                details: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });

    return router;
}
