#!/bin/bash

# Time Tracker - Uninstall LaunchAgent
# Removes the time tracker daemon from LaunchAgents

set -e

echo "═══════════════════════════════════════════════"
echo "  Time Tracker - Uninstall Background Daemon"
echo "═══════════════════════════════════════════════"
echo ""

PLIST_PATH="$HOME/Library/LaunchAgents/com.timetracker.daemon.plist"

# Check if plist exists
if [ ! -f "$PLIST_PATH" ]; then
    echo "❌ LaunchAgent not found at $PLIST_PATH"
    echo "It may not be installed."
    exit 1
fi

echo "Unloading LaunchAgent..."
launchctl unload "$PLIST_PATH" 2>/dev/null || true

echo "Removing plist file..."
rm "$PLIST_PATH"

echo ""
echo "✓ LaunchAgent uninstalled successfully"
echo ""
echo "Note: Your activity database and logs are still in:"
echo "  Database: $(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/data/"
echo "  Logs: ~/Library/Logs/timetracker*.log"
echo ""
echo "To remove these as well, delete them manually."
echo ""
