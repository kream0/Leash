# Leash - Product Requirements Document

## Vision

Enable developers to monitor and interact with their AI coding agents from their phone, providing visibility into what agents are doing without being tethered to the workstation.

## Target Users

- Developers using AI coding assistants (Copilot, Claude Code)
- Working on Windows with PowerShell or WSL
- Want to monitor agent progress while away from desk

## Problems Solved

1. **No visibility when AFK**: Can't see what the agent is doing when away from computer
2. **Context switching**: Have to go back to PC to check progress or respond
3. **Multiple agents**: Hard to track multiple agent sessions simultaneously

## MVP Features

### Core Features
| Feature | Priority | Status |
|---------|----------|--------|
| Agent list with status | P0 | Planned |
| Real-time activity feed | P0 | Planned |
| Send text messages to agent | P0 | Planned |
| Connection status indicator | P0 | Planned |

### Out of Scope (MVP)
- File viewing/editing
- Approval buttons for agent actions
- Voice interaction
- Remote access (VPN/cloud relay)

## Technical Requirements

### Performance
- Activity updates within 500ms
- Support 3+ simultaneous agent connections
- Minimal battery impact on mobile

### Network
- Local network only (same WiFi)
- WebSocket for real-time updates
- REST API for initial data fetch

### Security
- No authentication for MVP (local network)
- Future: Token-based auth for remote access

## Success Metrics

- Can see agent activity within 1 second
- Can send message and see it reflected in agent
- Stable connection for 1+ hour sessions
