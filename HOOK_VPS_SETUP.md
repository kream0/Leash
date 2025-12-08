# Configuring Hooks for VPS Connection

## Overview

The hook script on your local computer needs to know where to send data. By default, it tries `localhost`, but for VPS deployments, it needs to connect to your VPS IP or domain.

## Configuration Methods

### Method 1: Environment Variable (Recommended)

Set the `LEASH_SERVER_URL` environment variable:

**Windows (PowerShell):**
```powershell
# Set permanently for your user
[System.Environment]::SetEnvironmentVariable('LEASH_SERVER_URL', 'http://YOUR_VPS_IP:3001', 'User')

# Or temporarily in current session
$env:LEASH_SERVER_URL = 'http://YOUR_VPS_IP:3001'
```

**Linux/Mac:**
```bash
# Add to ~/.bashrc or ~/.zshrc
export LEASH_SERVER_URL='http://YOUR_VPS_IP:3001'

# Then reload
source ~/.bashrc
```

### Method 2: Update Hook Script Directly

Edit `~/.claude/hooks/leash_hook.js` and add your VPS URL to the hosts array:

```javascript
const LEASH_HOSTS = [
    'http://YOUR_VPS_IP:3001',           // Add this line first!
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'http://host.docker.internal:3001',
];
```

### Method 3: Config File (Future Enhancement)

Create `~/.leash/config.json`:
```json
{
  "serverUrl": "http://YOUR_VPS_IP:3001"
}
```

## With SSL/TLS (Production)

If you've set up SSL with NGINX:

```bash
export LEASH_SERVER_URL='https://leash.yourdomain.com'
```

## Verification

After configuring, test the hook connection:

1. **Start your VPS server**
2. **Run Claude Code** with hooks enabled
3. **Check server logs** on VPS:
   ```bash
   sudo journalctl -u leash -f
   ```
4. **Look for:**
   ```
   [Routes] Hook received: SessionStart from agent-xxx
   ```

## Hook Data Flow

```
┌─────────────────────┐
│  Your Computer      │
│                     │
│  ┌──────────────┐   │
│  │ Claude Code  │   │
│  │      ↓       │   │
│  │  Hook Script │───┼──── HTTP POST ────┐
│  └──────────────┘   │                   │
└─────────────────────┘                   │
                                          │
                                          ▼
                              ┌─────────────────────┐
                              │  VPS (Internet)     │
                              │                     │
                              │  ┌───────────────┐  │
                              │  │ Leash Server  │  │
                              │  │ Port 3001     │  │
                              │  └───────────────┘  │
                              │         │           │
                              └─────────┼───────────┘
                                        │
                                        ▼ WebSocket
                              ┌─────────────────────┐
                              │   Android App       │
                              │   (anywhere)        │
                              └─────────────────────┘
```

## Network Requirements

### On Your Computer (Where Claude Code Runs):
- ✅ Outbound HTTP/HTTPS access to VPS
- ✅ Port 3001 outbound (or 443 if using HTTPS)
- ❌ No inbound ports needed
- ❌ No port forwarding needed

### On VPS:
- ✅ Inbound port 3001 open (firewall configured)
- ✅ Server listening on all interfaces (`0.0.0.0`)

## Common Issues

### Hook can't connect to VPS

**Symptom:** No activity appears in Android app

**Check:**
1. **VPS firewall:** `sudo ufw status` (port 3001 should be allowed)
2. **Server running:** `sudo systemctl status leash`
3. **Environment variable:** `echo $LEASH_SERVER_URL`
4. **Network connectivity:** `curl http://YOUR_VPS_IP:3001/api/health`

### How to debug:

**On your computer:**
```bash
# Test if you can reach VPS
curl http://YOUR_VPS_IP:3001/api/health

# Should return: {"status":"ok"}
```

**On VPS:**
```bash
# Watch for incoming hook requests
sudo journalctl -u leash -f | grep Hook
```

## Authentication for Hooks

> **Note:** Currently, hook endpoints are **not** password-protected. This is by design to simplify local development.

For VPS deployments, you have two options:

### Option A: IP Whitelist (Recommended)
Configure firewall to only accept hook requests from your home IP:

```bash
# On VPS
sudo ufw allow from YOUR_HOME_IP to any port 3001
```

### Option B: Add Hook Authentication (Future)
We can add password authentication to hook endpoints if needed.

---

## Quick Setup Checklist

For VPS deployment with hooks:

- [ ] Set `LEASH_SERVER_URL` on your computer
- [ ] Verify environment variable: `echo $LEASH_SERVER_URL`
- [ ] Start VPS server: `sudo systemctl start leash`
- [ ] Test connectivity: `curl http://YOUR_VPS_IP:3001/api/health`
- [ ] Run Claude Code with hooks
- [ ] Check VPS logs for hook events
- [ ] Connect Android app to see activity

---

**Your hooks will now send data to your VPS!** 🚀
