# Last Session

**Date:** 2025-12-06
**Focus:** Message Queue & Interrupt Feature (Partial)

## Completed

### Server
- Added message queue system (`messageQueues` Map in routes.ts)
- Added `/api/agents/:id/queue` endpoint (GET - dequeue message for Stop hook)
- Added `/api/agents/:id/queue/peek` endpoint (GET - peek without removing)
- Added `/api/agents/:id/interrupt` endpoint (POST - send ESC to Claude window)
- Updated `/api/agents/:id/send` to queue messages instead of clipboard
- Updated WebSocket handler with `send_message` (queue) and `interrupt` handlers

### Hook (Global)
- Updated `~/.claude/hooks/leash_hook.js` to:
  - Check message queue on `Stop` event
  - If message exists, return `{ decision: "block", reason: "[Leash Remote Message]\n\n{message}" }`
  - This should inject the message when Claude finishes responding

### Android
- Added `sendInterrupt()` to LeashWebSocketClient and AgentRepository
- Added red Stop button in AgentDetailScreen app bar (top right)
- Messages now show "Message queued" snackbar instead of clipboard

## Known Issues / TODO for Next Session

### BUG: Message queueing behavior is wrong
**Problem:** Messages are being queued even when Claude is idle/waiting for input. The message doesn't appear in chat on phone or computer.

**Expected behavior:**
1. If Claude is **idle** (waiting for input) → message should be sent **immediately** (not queued)
2. If Claude is **working** → message should be **queued** and injected when Claude finishes

**Fix needed:**
- Track Claude's state (idle vs working) in AgentManager
- Use `Stop` event to mark as idle, `UserPromptSubmit`/`PreToolUse` to mark as working
- In send endpoint: if idle, use a different mechanism (maybe the Stop hook won't fire if already stopped)
- The Stop hook approach only works when Claude is actively working and then stops

**Alternative approach to consider:**
- When Claude is idle, the hook won't fire (nothing to stop)
- May need to simulate user input somehow, or use a file-based polling approach
- Could also consider using clipboard + auto-paste via PowerShell when idle

### Files Changed This Session
- `server/src/api/routes.ts` - Queue endpoints, interrupt endpoint
- `server/src/websocket/handler.ts` - Queue and interrupt WebSocket handlers
- `server/src/types/index.ts` - Added `interrupt` ClientMessage type
- `~/.claude/hooks/leash_hook.js` - Stop hook checks queue
- `android/.../LeashWebSocketClient.kt` - sendInterrupt(), queue handling
- `android/.../AgentRepository.kt` - sendInterrupt()
- `android/.../AgentDetailScreen.kt` - Interrupt button in app bar

## Architecture

### Current Message Flow (needs fix)
```
Android sends message → Server queues it → Stop hook checks queue
                                           ↳ But Stop only fires when Claude FINISHES working
                                           ↳ If Claude is idle, Stop never fires!
```

### Desired Message Flow
```
Android sends message → Server checks Claude state
  ├─ If IDLE: Send immediately (simulate input somehow)
  └─ If WORKING: Queue for Stop hook injection
```

## Next Steps
1. Fix the idle vs working state detection
2. Implement immediate send when Claude is idle
3. Test the interrupt button functionality
4. Test end-to-end message flow
