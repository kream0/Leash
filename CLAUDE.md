# Leash - AI Agent Instructions

## Project Overview

**Leash** is a mobile monitoring tool for AI coding agents. It consists of:
- **Android App**: Kotlin/Jetpack Compose mobile client
- **Bridge Server**: Node.js/TypeScript local server
- **Agent Adapters**: Terminal monitors for Copilot and Claude Code

## Tech Stack

| Component | Technologies |
|-----------|-------------|
| Server | Node.js 20+, TypeScript, Express, ws, node-pty |
| Android | Kotlin, Jetpack Compose, OkHttp, Retrofit, Material 3 |

## Development Commands

### Server
```bash
cd server
npm install          # Install dependencies
npm run dev          # Start dev server with hot reload
npm run build        # Build for production
npm test             # Run tests
```

### Android
Open `android/` in Android Studio. Use standard Gradle commands.

## Code Patterns

### Server
- TypeScript strict mode
- Express for REST, ws for WebSocket
- Adapters extend `BaseAdapter` interface
- All async operations use async/await

### Android
- Jetpack Compose for UI (no XML layouts)
- Repository pattern for data
- StateFlow for reactive state
- Material 3 design system

## Session Protocol

### Start of Session
1. Read `PRD.md` for product context
2. Read `LAST_SESSION.md` for recent work
3. Read `TODO.md` for current priorities

### End of Session
1. Update `LAST_SESSION.md` with summary
2. Update `TODO.md` with progress
3. Create commit with session work

## Git Commit Convention

- **Format**: `type(scope): description`
- **Types**: feat, fix, refactor, test, docs, chore
- **Scopes**: server, android, docs
- **Examples**:
  - `feat(server): add WebSocket connection handler`
  - `fix(android): resolve connection timeout issue`
