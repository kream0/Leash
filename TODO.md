# TODO - Leash Development

## Current Status: Setup Wizard & Installers IN PROGRESS

### Phase 11: Setup Wizard & Installers - IN PROGRESS
- [x] Linux/Mac setup script (install.sh)
- [x] Windows PowerShell script (install.ps1)
- [ ] Windows MSI installer (InnoSetup)
- [x] Interactive wizard with deployment mode selection
- [x] Claude hooks auto-installation
- [x] Custom domain configuration for VPS (LEASH_DOMAIN, LEASH_EXTERNAL_PORT)
- [ ] GitHub Releases integration

### Phase 10: VPS Deployment with Authentication - COMPLETE
- [x] Server password authentication (WebSocket + REST)
- [x] Android app password input and secure storage
- [x] VPS deployment documentation
- [x] SSL/TLS setup documentation
- [x] Web UI for QR code display
- [x] Hook configuration for VPS

### Phase 9: Android App UX Improvements - COMPLETE
- [x] Dark loading screen (no white flash)
- [x] Auto-connect when configured
- [x] Remove Activity tab - Chat only
- [x] Settings menu with Autopilot and Disconnect
- [x] Fix ISO date formatting (HH:mm for today)
- [x] Replace ALL emojis with Material icons
- [x] Improve diff detection (requires Edit: header)
- [x] Collapsible diffs (10+ lines, collapsed by default)
- [x] Continue button (sends "continue")
- [x] Autopilot toggle (auto-continue on Stop)

### Phase 7: Remote Messaging - COMPLETE
- [x] Message queue system on server
- [x] Interrupt endpoint (ESC key)
- [x] Hook-based message injection
- [x] All hooks registered for maximum retrieval
- [x] Interrupt button working
- [x] Instant messaging via clipboard

### Phase 8: Polish & Testing
- [x] PayloadTooLargeError fix (10mb limit)
- [ ] Error handling & reconnection logic
- [ ] Test with multiple concurrent agents
- [ ] Dark mode refinements

---

## Technical Notes

### Hook Message Injection
| Hook Type | Injection Method | Behavior |
|-----------|-----------------|----------|
| UserPromptSubmit | additionalContext | Non-blocking, adds to prompt |
| SessionStart | additionalContext | Non-blocking, adds at start |
| Stop | decision: block | Continues Claude with message |
| PreToolUse | decision: block | Interrupts before tool |
| PostToolUse | decision: block | Interrupts after tool |
| SubagentStop | decision: block | Continues subagent |

### Key Files
- `~/.claude/hooks/leash_hook.js` - Hook script
- `~/.claude/settings.json` - Hook configuration
- `server/scripts/interrupt-claude.ps1` - ESC key sender
- `server/scripts/send-to-claude.ps1` - Instant message sender

### Server endpoints
- WebSocket: `ws://192.168.1.12:3001/ws`
- REST API: `http://192.168.1.12:3001/api`

---

**Status:** Core features complete. Ready for testing and polish.
