#!/bin/bash

# Time Tracker - Install LaunchAgent
# This script installs the time tracker daemon as a LaunchAgent
# so it runs automatically at login

set -e

echo "═══════════════════════════════════════════════"
echo "  Time Tracker - Install Background Daemon"
echo "═══════════════════════════════════════════════"
echo ""

# Get the absolute path to the project directory
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DAEMON_PATH="$PROJECT_DIR/daemon/index.js"
PLIST_PATH="$HOME/Library/LaunchAgents/com.timetracker.daemon.plist"

echo "Project directory: $PROJECT_DIR"
echo "Daemon path: $DAEMON_PATH"
echo ""

# Check if daemon file exists
if [ ! -f "$DAEMON_PATH" ]; then
    echo "❌ Error: Daemon file not found at $DAEMON_PATH"
    exit 1
fi

# Find node executable
NODE_PATH=$(which node)
if [ -z "$NODE_PATH" ]; then
    echo "❌ Error: Node.js not found in PATH"
    echo "Please install Node.js first"
    exit 1
fi

echo "Node.js: $NODE_PATH"
echo ""

# Create LaunchAgents directory if it doesn't exist
mkdir -p "$HOME/Library/LaunchAgents"

# Create the plist file
echo "Creating LaunchAgent configuration..."
cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.timetracker.daemon</string>

    <key>ProgramArguments</key>
    <array>
        <string>$NODE_PATH</string>
        <string>$DAEMON_PATH</string>
    </array>

    <key>WorkingDirectory</key>
    <string>$PROJECT_DIR</string>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>$HOME/Library/Logs/timetracker.log</string>

    <key>StandardErrorPath</key>
    <string>$HOME/Library/Logs/timetracker-error.log</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.nvm/versions/node/$(node -v)/bin</string>
    </dict>
</dict>
</plist>
EOF

echo "✓ LaunchAgent plist created"
echo ""

# Load the LaunchAgent
echo "Loading LaunchAgent..."
if launchctl list | grep -q "com.timetracker.daemon"; then
    echo "  Unloading existing daemon..."
    launchctl unload "$PLIST_PATH" 2>/dev/null || true
fi

launchctl load "$PLIST_PATH"

echo "✓ LaunchAgent loaded"
echo ""
echo "═══════════════════════════════════════════════"
echo "  Installation Complete!"
echo "═══════════════════════════════════════════════"
echo ""
echo "The time tracker daemon is now running and will"
echo "start automatically when you log in."
echo ""
echo "Next steps:"
echo "  1. Grant Accessibility permission (see instructions below)"
echo "  2. Start the web UI: npm run server"
echo "  3. Open http://localhost:3000 in your browser"
echo ""
echo "Logs location:"
echo "  Output: ~/Library/Logs/timetracker.log"
echo "  Errors: ~/Library/Logs/timetracker-error.log"
echo ""
echo "To uninstall, run: bash scripts/uninstall-daemon.sh"
echo ""
