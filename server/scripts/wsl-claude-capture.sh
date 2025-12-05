#!/bin/bash
# Leash Claude Code output capture script
# This script runs Claude Code and captures all terminal output to a log file

LOG_DIR="/tmp/leash"
LOG_FILE="$LOG_DIR/claude-output.log"
PID_FILE="$LOG_DIR/claude.pid"

# Create log directory
mkdir -p "$LOG_DIR"

# Clear previous log
> "$LOG_FILE"

echo "[Leash] Starting Claude Code with output capture..."
echo "[Leash] Log file: $LOG_FILE"

# Change to the specified directory if provided
if [ -n "$1" ]; then
    cd "$1" || exit 1
    echo "[Leash] Working directory: $(pwd)"
fi

# Save our PID for the server to find
echo $$ > "$PID_FILE"

# Use script command to capture all terminal output
# -q = quiet, -f = flush after each write
# The output goes to both the terminal and the log file
exec script -q -f "$LOG_FILE" -c "claude"
