import express from 'express';
import { createServer } from 'http';
import { networkInterfaces } from 'os';
import qrcode from 'qrcode-terminal';
import { AgentManager } from './agent-manager.js';
import { createRoutes } from './api/routes.js';
import { WebSocketHandler } from './websocket/handler.js';

const PORT = process.env.PORT || 3000;

/**
 * Get the local network IP address.
 */
function getLocalIP(): string {
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name] || []) {
            // Skip internal and non-IPv4 addresses
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return 'localhost';
}

/**
 * Display connection info with QR code.
 */
function displayConnectionInfo(ip: string, port: number | string): void {
    const wsUrl = `ws://${ip}:${port}/ws`;
    const httpUrl = `http://${ip}:${port}`;

    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                    🐕 LEASH SERVER                         ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log('║  Scan this QR code with the Leash mobile app:              ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('');

    // Generate QR code
    qrcode.generate(wsUrl, { small: true }, (code) => {
        console.log(code);
        console.log('');
        console.log('Or connect manually:');
        console.log(`   WebSocket URL: ${wsUrl}`);
        console.log(`   REST API:      ${httpUrl}/api`);
        console.log(`   Health check:  ${httpUrl}/api/health`);
        console.log('');
    });
}

async function main() {
    // Create core components
    const agentManager = new AgentManager();
    const app = express();
    const server = createServer(app);

    // Middleware
    app.use(express.json());

    // CORS for mobile app
    app.use((_req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type');
        next();
    });

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

    // Get local IP
    const localIP = getLocalIP();

    // Start server
    server.listen(PORT, () => {
        displayConnectionInfo(localIP, PORT);
    });

    // Demo: Add a test Claude Code agent
    const agent = await agentManager.addClaudeCodeAgent();
    console.log(`Demo agent created: ${agent.name}`);

    // Graceful shutdown
    process.on('SIGINT', async () => {
        console.log('\nShutting down...');
        await agentManager.stopAll();
        server.close();
        process.exit(0);
    });
}

main().catch(console.error);
