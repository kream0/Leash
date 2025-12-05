#!/usr/bin/env node
/**
 * Leash Hook - Sends Claude Code activity to the Leash server
 * This hook is called for ALL Claude Code lifecycle events
 */

const http = require('http');

// Support both localhost and Windows host from WSL
const LEASH_HOST = process.env.LEASH_HOST || 'localhost';
const LEASH_PORT = process.env.LEASH_PORT || '3001';
const LEASH_AGENT_ID = process.env.LEASH_AGENT_ID || `claude-hooks-${process.pid}`;

async function sendToLeash(eventType, data) {
    return new Promise((resolve) => {
        const payload = JSON.stringify({
            type: 'hook_event',
            eventType,
            agentId: LEASH_AGENT_ID,
            timestamp: Date.now(),
            data
        });

        const options = {
            hostname: LEASH_HOST,
            port: parseInt(LEASH_PORT),
            path: '/api/hooks',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            },
            timeout: 2000
        };

        const req = http.request(options, (res) => {
            resolve(true);
        });

        req.on('error', (err) => {
            // Try Windows host IP if localhost fails (for WSL)
            if (LEASH_HOST === 'localhost') {
                tryWindowsHost(eventType, data).then(resolve);
            } else {
                resolve(false);
            }
        });

        req.on('timeout', () => {
            req.destroy();
            resolve(false);
        });

        req.write(payload);
        req.end();
    });
}

async function tryWindowsHost(eventType, data) {
    return new Promise((resolve) => {
        // Try common Windows host IP from WSL
        const payload = JSON.stringify({
            type: 'hook_event',
            eventType,
            agentId: LEASH_AGENT_ID,
            timestamp: Date.now(),
            data
        });

        // Get Windows host IP - typically the default gateway in WSL
        const hosts = ['host.docker.internal', '172.17.0.1', '192.168.1.12'];

        let completed = false;
        hosts.forEach(host => {
            if (completed) return;

            const options = {
                hostname: host,
                port: parseInt(LEASH_PORT),
                path: '/api/hooks',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload)
                },
                timeout: 1000
            };

            const req = http.request(options, (res) => {
                if (!completed) {
                    completed = true;
                    resolve(true);
                }
            });

            req.on('error', () => { });
            req.on('timeout', () => req.destroy());

            req.write(payload);
            req.end();
        });

        // Fallback timeout
        setTimeout(() => {
            if (!completed) {
                completed = true;
                resolve(false);
            }
        }, 1500);
    });
}

async function main() {
    const hookType = process.argv[2] || 'unknown';
    let inputData = {};

    // Read JSON from stdin if available
    try {
        const chunks = [];
        process.stdin.setEncoding('utf8');

        await new Promise((resolve, reject) => {
            process.stdin.on('data', chunk => chunks.push(chunk));
            process.stdin.on('end', resolve);
            process.stdin.on('error', reject);

            // Timeout after 100ms if no data
            setTimeout(resolve, 100);
        });

        if (chunks.length > 0) {
            const data = chunks.join('');
            if (data.trim()) {
                inputData = JSON.parse(data);
            }
        }
    } catch (e) {
        // No stdin or invalid JSON - that's OK
    }

    await sendToLeash(hookType, inputData);
    process.exit(0);
}

main();
