#!/usr/bin/env node
/**
 * Leash Hook Script for Antigravity/VS Code based AI agents
 * 
 * This script sends events to the Leash server for remote monitoring.
 * It can be used as a reference for integrating Antigravity or any VS Code-based
 * AI agent with Leash.
 * 
 * Usage:
 *   - As a standalone script: node leash_antigravity_hook.js --event SessionStart
 *   - From VS Code extension: Import and call sendEvent()
 *   - Via stdin: echo '{"eventType":"SessionStart"}' | node leash_antigravity_hook.js
 * 
 * Environment Variables:
 *   LEASH_SERVER_URL - Primary server URL (default: http://localhost:3001)
 *   LEASH_PASSWORD   - Authentication password (optional)
 */

const http = require('http');
const https = require('https');
const os = require('os');

// Configuration
const AGENT_SOURCE = 'antigravity';
const AGENT_ID = `antigravity-${process.platform === 'win32' ? 'win' : 'unix'}-${process.pid}`;

// Server URLs to try (in order of priority)
const SERVERS = [
    process.env.LEASH_SERVER_URL,
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'http://host.docker.internal:3001'
].filter(Boolean);

const AUTH_PASSWORD = process.env.LEASH_PASSWORD || '';

/**
 * Send an event to the Leash server
 * @param {string} eventType - The type of event (SessionStart, UserPromptSubmit, PreToolUse, etc.)
 * @param {object} data - Additional event data
 * @returns {Promise<boolean>} - Whether the event was sent successfully
 */
async function sendEvent(eventType, data = {}) {
    const payload = JSON.stringify({
        type: 'hook_event',
        eventType: eventType,
        agentId: AGENT_ID,
        source: AGENT_SOURCE,
        data: {
            ...data,
            hostname: os.hostname(),
            timestamp: Date.now()
        }
    });

    for (const serverUrl of SERVERS) {
        try {
            const url = new URL('/api/hooks', serverUrl);
            const client = url.protocol === 'https:' ? https : http;

            const result = await new Promise((resolve, reject) => {
                const req = client.request(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(payload),
                        ...(AUTH_PASSWORD ? { 'Authorization': AUTH_PASSWORD } : {})
                    },
                    timeout: 3000
                }, (res) => {
                    let body = '';
                    res.on('data', chunk => body += chunk);
                    res.on('end', () => {
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            resolve({ success: true, server: serverUrl });
                        } else {
                            reject(new Error(`HTTP ${res.statusCode}: ${body}`));
                        }
                    });
                });

                req.on('error', reject);
                req.on('timeout', () => {
                    req.destroy();
                    reject(new Error('Request timeout'));
                });

                req.write(payload);
                req.end();
            });

            console.log(`[Leash] Event ${eventType} sent to ${serverUrl}`);
            return true;
        } catch (err) {
            // Try next server
            continue;
        }
    }

    console.error(`[Leash] Failed to send event ${eventType} to any server`);
    return false;
}

/**
 * Convenience methods for common events
 */
const LeashHooks = {
    sessionStart: (workingDir) => sendEvent('SessionStart', { working_directory: workingDir }),
    userPrompt: (prompt) => sendEvent('UserPromptSubmit', { prompt: prompt }),
    preToolUse: (toolName, toolInput) => sendEvent('PreToolUse', { tool_name: toolName, input: toolInput }),
    postToolUse: (toolName, success, output) => sendEvent('PostToolUse', { tool_name: toolName, success, output }),
    assistantResponse: (response) => sendEvent('Stop', { assistant_response: response }),
    notification: (message) => sendEvent('Notification', { message: message })
};

// CLI mode - parse command line arguments or stdin
async function main() {
    const args = process.argv.slice(2);

    // Check for --event flag
    const eventIndex = args.indexOf('--event');
    if (eventIndex !== -1 && args[eventIndex + 1]) {
        const eventType = args[eventIndex + 1];
        const dataIndex = args.indexOf('--data');
        let data = {};

        if (dataIndex !== -1 && args[dataIndex + 1]) {
            try {
                data = JSON.parse(args[dataIndex + 1]);
            } catch (e) {
                data = { message: args[dataIndex + 1] };
            }
        }

        await sendEvent(eventType, data);
        return;
    }

    // Check for stdin input
    if (!process.stdin.isTTY) {
        const chunks = [];
        for await (const chunk of process.stdin) {
            chunks.push(chunk);
        }

        try {
            const input = JSON.parse(Buffer.concat(chunks).toString());
            await sendEvent(input.eventType || input.type || 'unknown', input.data || input);
        } catch (err) {
            console.error('[Leash] Failed to parse stdin:', err.message);
        }
        return;
    }

    // No arguments - show usage
    console.log(`
Leash Antigravity Hook Script

Usage:
  node leash_antigravity_hook.js --event <EventType> [--data <JSON>]
  echo '{"eventType":"SessionStart"}' | node leash_antigravity_hook.js

Event Types:
  SessionStart      - Agent session started
  UserPromptSubmit  - User submitted a prompt
  PreToolUse        - About to use a tool
  PostToolUse       - Tool execution completed
  Stop              - Assistant finished responding
  Notification      - General notification

Environment:
  LEASH_SERVER_URL  - Server URL (default: http://localhost:3001)
  LEASH_PASSWORD    - Authentication password

Example:
  node leash_antigravity_hook.js --event SessionStart --data '{"working_directory":"/home/user/project"}'
`);
}

// Export for use as a module
module.exports = { sendEvent, LeashHooks, AGENT_ID };

// Run if executed directly
if (require.main === module) {
    main().catch(console.error);
}
