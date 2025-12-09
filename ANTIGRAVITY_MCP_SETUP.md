# Antigravity MCP Configuration

Configure Antigravity to use Leash for real-time mobile monitoring.

## Setup

### 1. Open Antigravity Settings
Go to **File → Preferences → Settings** (or `Ctrl+,`)

### 2. Search for "MCP"
Find the MCP server configuration section

### 3. Add Leash MCP Server

Add this to your MCP configuration:

```json
{
  "leash": {
    "command": "node",
    "args": ["C:/Users/Karim/Documents/work/sandbox/leash/server/dist/mcp-server.js"],
    "env": {
      "LEASH_SERVER_URL": "http://localhost:3001",
      "LEASH_PASSWORD": "test123"
    }
  }
}
```

> **Note:** Update the path to match your Leash installation location.

### 4. Restart Antigravity
Restart for changes to take effect.

## Usage

Once configured, Antigravity will have access to these tools:

| Tool | Description |
|------|-------------|
| `leash_log_activity` | Log activity to your mobile device |
| `leash_check_messages` | Check for messages from mobile app |
| `leash_send_prompt` | Log user prompts for monitoring |
| `leash_log_tool` | Log tool usage to mobile |

## Verification

After configuration, you should see:
1. New Antigravity agent in Leash mobile app
2. Real-time activity updates when prompted
