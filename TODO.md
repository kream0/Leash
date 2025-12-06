# TODO - Leash Development

## Current Priority: Fix Remote Messaging

### CRITICAL BUG TO FIX
- [ ] **Message queueing only works when Claude is working, not when idle**
  - Stop hook only fires when Claude finishes a task
  - If Claude is idle/waiting, queued messages never get delivered
  - Need to detect idle state and send immediately (clipboard+paste? or other method)

### Phase 1-6: ✅ COMPLETE
(See previous sessions)

### Phase 7: Remote Messaging (IN PROGRESS)
- [x] Add message queue system on server
- [x] Add interrupt endpoint (ESC key to Claude window)
- [x] Update Stop hook to check queue and inject messages
- [x] Add interrupt button to Android app
- [ ] **FIX: Detect idle vs working state**
- [ ] **FIX: Send immediately when idle (not queue)**
- [ ] Test interrupt button functionality
- [ ] Test end-to-end remote messaging

### Phase 8: Polish & Testing
- [ ] Error handling & reconnection logic
- [ ] Test with multiple concurrent agents
- [ ] Dark mode refinements
- [ ] Update tracking files automation

---

## Technical Notes for Next Agent

### Key Files for Remote Messaging Fix:
1. `server/src/api/routes.ts` - Message queue logic, needs state check
2. `server/src/agent-manager.ts` - Could track agent state (idle/working)
3. `~/.claude/hooks/leash_hook.js` - Stop hook that checks queue
4. `server/src/websocket/handler.ts` - WebSocket message handlers

### Possible Solutions:
1. **Track state in AgentManager:**
   - On `UserPromptSubmit` or `PreToolUse` → mark as "working"
   - On `Stop` → mark as "idle"
   - In send endpoint: check state, if idle use clipboard+auto-paste

2. **Auto-paste when idle:**
   - Copy to clipboard
   - Use PowerShell to send Ctrl+V to Claude window
   - This simulates user pasting the message

3. **Polling approach:**
   - Write message to a file
   - Have a background script that watches and pastes when Claude is idle

### Current Hook Location:
`C:\Users\Karim\.claude\hooks\leash_hook.js`

### Server runs on:
- WebSocket: `ws://192.168.1.12:3001/ws`
- REST API: `http://192.168.1.12:3001/api`

---

**Status:** Remote messaging partially implemented, needs idle state handling fix
