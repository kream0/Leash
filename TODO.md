# TODO - Leash Development

## Current Priority: Testing & Polish

### Phase 1: Initialization ✅ COMPLETE
- [x] Design architecture
- [x] Create project files (README, CLAUDE.md, PRD.md)
- [x] Initialize git repo
- [x] Create server project structure
- [x] Create Android project structure

### Phase 2: Bridge Server ✅ COMPLETE
- [x] Express + WebSocket server setup
- [x] Agent base adapter interface
- [x] Claude Code adapter (terminal monitoring)
- [x] Copilot adapter
- [x] REST API endpoints
- [x] WebSocket message handlers

### Phase 3: Android App ✅ COMPLETE
- [x] Android project with Compose
- [x] WebSocket client
- [x] Agent list screen
- [x] Agent detail screen with activity feed
- [x] Message input component
- [x] Connection status UI

### Phase 4: Claude Code Hooks ✅ COMPLETE
- [x] Create hook script (~/.claude/hooks/leash_hook.js) - GLOBAL
- [x] Hook configuration (~/.claude/settings.json) - GLOBAL
- [x] Multi-host fallback (localhost, 127.0.0.1, Docker hosts)
- [x] Server endpoint for hook events (/api/hooks)
- [x] Real-time relay to mobile clients
- [x] Agent detector for auto-discovery

### Phase 5: Real-time Chat ✅ COMPLETE
- [x] QR code connection setup
- [x] Build and install on device
- [x] End-to-end testing with live Claude sessions
- [x] Chat history API endpoint (GET /api/agents/:id/chat)
- [x] Real-time transcript watching (TranscriptWatcher)
- [x] WebSocket streaming of chat messages
- [x] Android chat UI with Activity/Chat tabs
- [x] Rich tool formatting (diffs, file names, commands)
- [x] Git-style colored diffs in chat view
- [x] Auto-scroll on tab switch

### Phase 6: UX Polish ✅ COMPLETE
- [x] Instant scroll-to-bottom (replaced slow animation)
- [x] Elaborate diff styling (monospace, colored backgrounds, headers)
- [x] Clipboard-based messaging (send from phone to Claude Code)
- [x] Snackbar feedback for message sending

### Phase 7: Testing & Stability
- [ ] Test clipboard messaging end-to-end
- [ ] Add visual indicator while message is being sent
- [ ] Error handling & reconnection logic
- [ ] Test with multiple concurrent agents
- [ ] Consider sound/vibration notifications
- [ ] Dark mode refinements

---

**Status:** Clipboard messaging implemented, ready for end-to-end testing
