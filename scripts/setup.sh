#!/bin/bash

# Time Tracker - First-Time Setup
# Guides the user through initial setup

set -e

echo "═══════════════════════════════════════════════"
echo "  Time Tracker - First-Time Setup"
echo "═══════════════════════════════════════════════"
echo ""

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Welcome to Time Tracker!"
echo ""
echo "This script will help you set up the time tracker"
echo "for the first time."
echo ""

# Check Node.js
echo "Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found"
    echo ""
    echo "Please install Node.js first:"
    echo "  brew install node"
    echo "  or visit https://nodejs.org"
    exit 1
fi

NODE_VERSION=$(node -v)
echo "✓ Node.js found: $NODE_VERSION"
echo ""

# Check if dependencies are installed
if [ ! -d "$PROJECT_DIR/node_modules" ]; then
    echo "Installing dependencies..."
    cd "$PROJECT_DIR"
    npm install
    echo "✓ Dependencies installed"
    echo ""
fi

# Create data directory
if [ ! -d "$PROJECT_DIR/data" ]; then
    echo "Creating data directory..."
    mkdir -p "$PROJECT_DIR/data"
    echo "✓ Data directory created"
    echo ""
fi

echo "═══════════════════════════════════════════════"
echo "  Setup Options"
echo "═══════════════════════════════════════════════"
echo ""
echo "How do you want to run the time tracker?"
echo ""
echo "  1) Manual (run when needed with 'npm start')"
echo "  2) Background daemon (auto-start at login)"
echo ""
read -p "Enter your choice (1 or 2): " choice
echo ""

if [ "$choice" = "2" ]; then
    bash "$PROJECT_DIR/scripts/install-daemon.sh"
else
    echo "Manual mode selected."
    echo ""
    echo "To start tracking:"
    echo "  1. Run: npm start"
    echo "  2. Grant Accessibility permission when prompted"
    echo "  3. In another terminal, run: npm run server"
    echo "  4. Open http://localhost:8765"
fi

echo ""
echo "═══════════════════════════════════════════════"
echo "  No Permissions Required!"
echo "═══════════════════════════════════════════════"
echo ""
echo "This version reads browser history directly,"
echo "so no system permissions are needed."
echo ""
echo "To start tracking:"
echo "  1. Run: npm start"
echo "  2. In another terminal: npm run server"
echo "  3. Open: http://localhost:8765"
echo ""
echo "═══════════════════════════════════════════════"
echo "  Setup Complete!"
echo "═══════════════════════════════════════════════"
echo ""
