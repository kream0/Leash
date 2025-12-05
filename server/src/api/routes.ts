import { Router, type Request, type Response } from 'express';
import type { Agent } from '../types/index.js';
import type { AgentManager } from '../agent-manager.js';

/**
 * Creates Express routes for the REST API.
 */
export function createRoutes(agentManager: AgentManager): Router {
    const router = Router();

    // GET /api/agents - List all connected agents
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
        res.json({ agent });
    });

    // POST /api/agents/:id/message - Send message to agent
    router.post('/agents/:id/message', (req: Request, res: Response) => {
        const { id } = req.params;
        const { message } = req.body as { message?: string };

        if (!message) {
            res.status(400).json({ error: 'Message is required' });
            return;
        }

        const success = agentManager.sendMessage(id, message);
        if (!success) {
            res.status(404).json({ error: 'Agent not found' });
            return;
        }

        res.json({ success: true });
    });

    // GET /api/health - Health check
    router.get('/health', (_req: Request, res: Response) => {
        res.json({ status: 'ok', timestamp: Date.now() });
    });

    // POST /api/hooks - Receive Claude Code hook events
    router.post('/hooks', (req: Request, res: Response) => {
        const { type, eventType, agentId, timestamp, data } = req.body;

        if (type !== 'hook_event') {
            res.status(400).json({ error: 'Invalid hook event type' });
            return;
        }

        console.log(`[Hooks] Received ${eventType} from ${agentId}`);

        // Format activity message based on event type
        let activityMessage = '';
        switch (eventType) {
            case 'SessionStart':
                activityMessage = '🚀 Claude Code session started';
                break;
            case 'UserPromptSubmit':
                activityMessage = `📝 User: ${data?.prompt?.substring(0, 100) || 'submitted prompt'}...`;
                break;
            case 'PreToolUse':
                activityMessage = `🔧 Using tool: ${data?.tool_name || data?.name || 'unknown'}`;
                break;
            case 'PostToolUse':
                const toolName = data?.tool_name || data?.name || 'tool';
                const success = data?.error ? '❌' : '✅';
                activityMessage = `${success} ${toolName} completed`;
                break;
            case 'Notification':
                activityMessage = `📣 ${data?.message || data?.content || 'notification'}`;
                break;
            case 'Stop':
                activityMessage = '⏹️ Claude Code stopped';
                break;
            default:
                activityMessage = `📌 ${eventType}: ${JSON.stringify(data).substring(0, 100)}`;
        }

        // Emit activity to the agent manager
        // Get or create hooks-based agent
        const agent = agentManager.getOrCreateHooksAgent(agentId);
        agentManager.emit('activity', agent.id, activityMessage);

        res.json({ success: true, received: eventType });
    });

    return router;
}
