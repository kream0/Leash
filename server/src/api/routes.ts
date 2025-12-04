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

    return router;
}
