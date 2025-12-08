import express from 'express';
import { createServer } from 'http';
import { networkInterfaces } from 'os';
import qrcode from 'qrcode-terminal';
import { AgentManager } from './agent-manager.js';
import { createRoutes } from './api/routes.js';
import { WebSocketHandler } from './websocket/handler.js';

const PORT = process.env.PORT || 3001;
const PASSWORD = process.env.LEASH_PASSWORD;
const CUSTOM_DOMAIN = process.env.LEASH_DOMAIN;
const EXTERNAL_PORT = process.env.LEASH_EXTERNAL_PORT;

/**
 * Get the local network IP address.
 * Prioritizes WiFi and physical interfaces over virtual ones.
 */
function getLocalIP(): string {
    const nets = networkInterfaces();
    const candidates: { address: string; priority: number }[] = [];

    for (const name of Object.keys(nets)) {
        for (const net of nets[name] || []) {
            // Skip internal and non-IPv4 addresses
            if (net.family === 'IPv4' && !net.internal) {
                const lowerName = name.toLowerCase();
                let priority = 0;

                // Prioritize WiFi and physical interfaces
                if (lowerName.includes('wi-fi') || lowerName.includes('wifi') || lowerName.includes('wlan')) {
                    priority = 100;
                } else if (lowerName.includes('ethernet') && !lowerName.includes('vethernet')) {
                    priority = 90;
                } else if (lowerName.startsWith('eth')) {
                    priority = 80;
                } else if (lowerName.includes('vethernet') || lowerName.includes('wsl') || lowerName.includes('hyper-v')) {
                    priority = 10; // Virtual interfaces - low priority
                } else {
                    priority = 50; // Unknown interfaces
                }

                candidates.push({ address: net.address, priority });
            }
        }
    }

    // Sort by priority (highest first) and return the best match
    candidates.sort((a, b) => b.priority - a.priority);
    return candidates[0]?.address || 'localhost';
}

/**
 * Display connection info with QR code.
 */
function displayConnectionInfo(ip: string, port: number | string): void {
    // Determine if we're in VPS mode
    const isVpsMode = !!CUSTOM_DOMAIN;
    const protocol = isVpsMode ? 'wss' : 'ws';
    const httpProtocol = isVpsMode ? 'https' : 'http';

    // Use custom domain if set, otherwise use detected IP
    const host = CUSTOM_DOMAIN || ip;

    // Use external port if set, otherwise use server port
    const externalPort = EXTERNAL_PORT || port;
    const portSuffix = (externalPort === '443' || externalPort === '80') ? '' : `:${externalPort}`;

    const wsUrl = `${protocol}://${host}${portSuffix}/ws`;
    const httpUrl = `${httpProtocol}://${host}${portSuffix}`;

    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                    🐕 LEASH SERVER                         ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log('║  Scan this QR code with the Leash mobile app:              ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('');

    if (isVpsMode) {
        console.log(`[VPS Mode] Using domain: ${CUSTOM_DOMAIN}`);
        console.log('');
    }

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

    // Middleware - increase limit for large hook payloads
    app.use(express.json({ limit: '10mb' }));

    // Serve static files (web UI)
    app.use(express.static('public'));

    // CORS for mobile app
    app.use((_req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        next();
    });

    // Connection info endpoint for web UI
    app.get('/api/connection-info', (_req, res) => {
        // Determine if we're in production/VPS mode
        const isProduction = process.env.NODE_ENV === 'production' || !!CUSTOM_DOMAIN;
        const protocol = isProduction ? 'wss' : 'ws';
        const httpProtocol = isProduction ? 'https' : 'http';

        // Use custom domain if set, otherwise use detected local IP
        const host = CUSTOM_DOMAIN || localIP;

        // Use external port if set, otherwise use server port
        // If external port is 443 (HTTPS) or 80 (HTTP), omit the port from URL
        const externalPort = EXTERNAL_PORT || PORT;
        const portSuffix = (externalPort === '443' || externalPort === '80') ? '' : `:${externalPort}`;

        const wsUrl = `${protocol}://${host}${portSuffix}/ws`;
        const apiUrl = `${httpProtocol}://${host}${portSuffix}/api`;

        res.json({
            wsUrl,
            apiUrl,
            authEnabled: !!PASSWORD,
            isVpsMode: !!CUSTOM_DOMAIN
        });
    });

    // API routes
    app.use('/api', createRoutes(agentManager, PASSWORD));

    // WebSocket upgrade handling
    const wsHandler = new WebSocketHandler(agentManager, PASSWORD);
    server.on('upgrade', (request, socket, head) => {
        if (request.url?.startsWith('/ws')) {
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

        // Log authentication status
        if (PASSWORD) {
            console.log('[Server] 🔒 Authentication ENABLED - password required for all connections');
        } else {
            console.warn('[Server] ⚠️  Authentication DISABLED - suitable for local network only');
            console.warn('[Server] ⚠️  For VPS deployment, set LEASH_PASSWORD environment variable');
        }
    });

    // Start auto-detection of AI coding agents
    agentManager.startAutoDetection(5000);
    console.log('[Server] Auto-detection enabled - scanning for Claude Code and Copilot processes...');

    // Graceful shutdown
    process.on('SIGINT', async () => {
        console.log('\nShutting down...');
        await agentManager.stopAll();
        server.close();
        process.exit(0);
    });
}

main().catch(console.error);
