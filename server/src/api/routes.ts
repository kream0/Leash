import { Router, type Request, type Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import type { AgentManager } from '../agent-manager.js';
import type { ChatMessage } from '../types/index.js';

const execAsync = promisify(exec);

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
export function createRoutes(agentManager: AgentManager): Router {
    const router = Router();

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

    // POST /api/agents/:id/send - Send a message to a Claude Code session
    router.post('/agents/:id/send', async (req: Request, res: Response) => {
        const agent = agentManager.getAgent(req.params.id);
        if (!agent) {
            res.status(404).json({ error: 'Agent not found' });
            return;
        }

        const { message } = req.body;
        if (!message || typeof message !== 'string') {
            res.status(400).json({ error: 'Message is required' });
            return;
        }

        // For now, we can't directly send to Claude Code - it doesn't have an input API
        // This would require a different approach like clipboard or file-based communication
        // For MVP, we'll return an error explaining the limitation
        res.status(501).json({
            error: 'Direct message sending not yet supported',
            hint: 'Claude Code CLI does not expose an input API. Future versions may use clipboard or file-based messaging.'
        });
    });

    return router;
}
