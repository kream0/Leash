#!/usr/bin/env node
/**
 * Leash MCP Server
 * 
 * This server allows Antigravity (and other MCP-compatible AI IDEs) to integrate
 * with Leash for real-time monitoring on mobile devices.
 * 
 * Usage:
 *   Configure in Antigravity Settings → MCP:
 *   {
 *     "leash": {
 *       "command": "node",
 *       "args": ["path/to/leash/server/dist/mcp-server.js"]
 *     }
 *   }
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as http from 'http';
import * as https from 'https';
import * as os from 'os';

// Configuration
const LEASH_SERVER_URL = process.env.LEASH_SERVER_URL || 'http://localhost:3001';
const LEASH_PASSWORD = process.env.LEASH_PASSWORD || '';
const AGENT_ID = `antigravity-mcp-${os.hostname()}-${process.pid}`;

// Create MCP server
const server = new McpServer({
    name: 'leash',
    version: '1.0.0',
});

/**
 * Send an event to the Leash REST API
 */
async function sendToLeash(eventType: string, data: Record<string, unknown> = {}): Promise<boolean> {
    const payload = JSON.stringify({
        type: 'hook_event',
        eventType,
        agentId: AGENT_ID,
        source: 'antigravity',
        data: {
            ...data,
            timestamp: Date.now(),
            hostname: os.hostname()
        }
    });

    return new Promise((resolve) => {
        try {
            const url = new URL('/api/hooks', LEASH_SERVER_URL);
            const client = url.protocol === 'https:' ? https : http;

            const req = client.request(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload),
                    ...(LEASH_PASSWORD ? { 'Authorization': LEASH_PASSWORD } : {})
                },
                timeout: 5000
            }, (res) => {
                resolve(res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300);
            });

            req.on('error', () => resolve(false));
            req.on('timeout', () => {
                req.destroy();
                resolve(false);
            });

            req.write(payload);
            req.end();
        } catch {
            resolve(false);
        }
    });
}

/**
 * Check for pending messages from mobile app
 */
async function checkForMessages(): Promise<{ hasMessage: boolean; message?: string }> {
    return new Promise((resolve) => {
        try {
            const url = new URL(`/api/agents/${AGENT_ID}/queue`, LEASH_SERVER_URL);
            const client = url.protocol === 'https:' ? https : http;

            const req = client.request(url, {
                method: 'GET',
                headers: {
                    ...(LEASH_PASSWORD ? { 'Authorization': LEASH_PASSWORD } : {})
                },
                timeout: 3000
            }, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    try {
                        const data = JSON.parse(body);
                        resolve(data);
                    } catch {
                        resolve({ hasMessage: false });
                    }
                });
            });

            req.on('error', () => resolve({ hasMessage: false }));
            req.on('timeout', () => {
                req.destroy();
                resolve({ hasMessage: false });
            });

            req.end();
        } catch {
            resolve({ hasMessage: false });
        }
    });
}

// ============================================================================
// MCP Tools
// ============================================================================

// Tool: Log activity to Leash
server.tool(
    'leash_log_activity',
    'Log activity to Leash mobile monitor. Call this to send updates to your mobile device.',
    {
        message: z.string().describe('Activity message to log'),
        type: z.enum(['info', 'success', 'warning', 'error']).optional().describe('Type of activity')
    },
    async ({ message, type = 'info' }) => {
        const icons: Record<string, string> = {
            info: 'ℹ️',
            success: '✅',
            warning: '⚠️',
            error: '❌'
        };

        const activityMessage = `${icons[type] || 'ℹ️'} ${message}`;
        const success = await sendToLeash('Notification', { message: activityMessage });

        return {
            content: [{
                type: 'text' as const,
                text: success
                    ? `Activity logged to Leash: "${message}"`
                    : 'Failed to send to Leash server (is it running?)'
            }]
        };
    }
);

// Tool: Check for messages from mobile
server.tool(
    'leash_check_messages',
    'Check if there are any messages from the Leash mobile app.',
    {},
    async () => {
        const result = await checkForMessages();

        if (result.hasMessage && result.message) {
            // Log that we received a message
            await sendToLeash('Notification', { message: `📱 Received remote message` });

            return {
                content: [{
                    type: 'text' as const,
                    text: `[Leash Remote Message] ${result.message}`
                }]
            };
        }

        return {
            content: [{
                type: 'text' as const,
                text: 'No pending messages from Leash mobile app.'
            }]
        };
    }
);

// Tool: Send user prompt to Leash
server.tool(
    'leash_send_prompt',
    'Log a user prompt/request to Leash for mobile monitoring.',
    {
        prompt: z.string().describe('The user prompt or request text')
    },
    async ({ prompt }) => {
        const success = await sendToLeash('UserPromptSubmit', { prompt });

        return {
            content: [{
                type: 'text' as const,
                text: success
                    ? 'Prompt logged to Leash'
                    : 'Failed to log prompt to Leash'
            }]
        };
    }
);

// Tool: Log tool usage to Leash
server.tool(
    'leash_log_tool',
    'Log tool usage to Leash mobile monitor.',
    {
        toolName: z.string().describe('Name of the tool being used'),
        status: z.enum(['started', 'completed', 'failed']).describe('Status of tool execution'),
        details: z.string().optional().describe('Additional details about the tool usage')
    },
    async ({ toolName, status, details }) => {
        const eventType = status === 'started' ? 'PreToolUse' : 'PostToolUse';
        const success = await sendToLeash(eventType, {
            tool_name: toolName,
            status,
            details,
            error: status === 'failed' ? true : undefined
        });

        return {
            content: [{
                type: 'text' as const,
                text: success
                    ? `Tool ${toolName} (${status}) logged to Leash`
                    : 'Failed to log tool to Leash'
            }]
        };
    }
);

// ============================================================================
// Server Lifecycle
// ============================================================================

async function main() {
    // Send session start notification
    await sendToLeash('SessionStart', {
        working_directory: process.cwd(),
        pid: process.pid
    });

    // Create transport and connect
    const transport = new StdioServerTransport();
    await server.connect(transport);

    // Log startup
    console.error('[Leash MCP] Server started');
    console.error(`[Leash MCP] Agent ID: ${AGENT_ID}`);
    console.error(`[Leash MCP] Connecting to: ${LEASH_SERVER_URL}`);
}

main().catch((error) => {
    console.error('[Leash MCP] Fatal error:', error);
    process.exit(1);
});
