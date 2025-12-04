import express from 'express';
import { createServer } from 'http';
import { AgentManager } from './agent-manager.js';
import { createRoutes } from './api/routes.js';
import { WebSocketHandler } from './websocket/handler.js';

const PORT = process.env.PORT || 3000;

async function main() {
    // Create core components
    const agentManager = new AgentManager();
    const app = express();
    const server = createServer(app);

    // Middleware
    app.use(express.json());

    // API routes
    app.use('/api', createRoutes(agentManager));

    // WebSocket upgrade handling
    const wsHandler = new WebSocketHandler(agentManager);
    server.on('upgrade', (request, socket, head) => {
        if (request.url === '/ws') {
            wsHandler.handleUpgrade(request, socket, head);
        } else {
            socket.destroy();
        }
    });

    // Start server
    server.listen(PORT, () => {
        console.log(`🐕 Leash server running on http://localhost:${PORT}`);
        console.log(`   REST API: http://localhost:${PORT}/api`);
        console.log(`   WebSocket: ws://localhost:${PORT}/ws`);
    });

    // Demo: Add a test Claude Code agent
    const agent = await agentManager.addClaudeCodeAgent();
    console.log(`   Demo agent created: ${agent.name}`);

    // Graceful shutdown
    process.on('SIGINT', async () => {
        console.log('\nShutting down...');
        await agentManager.stopAll();
        server.close();
        process.exit(0);
    });
}

main().catch(console.error);
