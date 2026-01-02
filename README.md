# Time Tracker

A privacy-focused time tracking application for macOS that reads your browser history to help you understand how you spend your work hours.

## Features

- **Browser History Tracking**: Reads Chrome & Safari history to track time by domain
- **No System Permissions Required**: Works by reading browser history files directly
- **Domain Grouping**: Automatically groups browser activity by domain (perfect for web developers)
- **Local Storage**: All data stays on your machine in a SQLite database
- **Web UI**: Simple dashboard to view your time reports at localhost:8765
- **Secure**: No accessibility permissions needed - just reads browser databases

## Requirements

- macOS 10.15 or later
- Node.js 16 or later
- Chrome or Safari browser (for tracking)

## Installation

1. Clone or download this repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the daemon:
   ```bash
   npm start
   ```
   No permissions required!

4. In another terminal, start the web server:
   ```bash
   npm run server
   ```

5. Open the web UI in your browser:
   ```
   http://localhost:8765
   ```

## Installation as Background Service

To run the tracker automatically at login:

```bash
bash scripts/install-daemon.sh
```

To stop and remove the background service:

```bash
bash scripts/uninstall-daemon.sh
```

## Usage

Once running, the daemon will:
- Check your browser history every 5 minutes
- Aggregate visits into time sessions by domain
- Store all activity in `data/activity.db`
- Web UI available at `http://localhost:8765`

## Privacy & Security

- **No system permissions required**: Reads browser history files directly
- **No network calls**: All data stays local
- **No keystroke logging**: Only reads browser history databases
- **No active monitoring**: Just periodic history snapshots
- **Full control**: Delete your database anytime

## Configuration

Edit settings via the web UI at `http://localhost:8765/settings`:

- Polling interval (default: 5 minutes)
- Session gap threshold (default: 5 minutes)
- Excluded domains

## How It Works

1. **Browser History Reading**: Copies Chrome/Safari history databases (they're locked while browsers run)
2. **Session Aggregation**: Groups consecutive visits to the same domain within 5 minutes
3. **Time Calculation**: Estimates time spent based on visit timestamps
4. **Storage**: Saves sessions to local SQLite database
5. **Visualization**: Web UI displays daily reports and charts

## Project Structure

```
time-tracker/
├── daemon/          # Background tracking daemon
├── database/        # SQLite schema and queries
├── server/          # Express web server
├── public/          # Static assets (CSS, JS)
├── data/            # SQLite database (gitignored)
└── scripts/         # Installation scripts
```

## Development

Run in development mode with auto-reload:

```bash
npm run dev
```

## License

MIT
