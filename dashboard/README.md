# Migration Dashboard

Real-time web dashboard for monitoring SFRA to Storefront Next migration progress.

## Features

- **Live Updates**: Server-Sent Events (SSE) for real-time filesystem monitoring
- **Progress Tracking**: Visual progress bar and completion statistics
- **Screenshot Gallery**: Side-by-side comparison of SFRA source vs Storefront Next target
- **Migration Log**: Rendered markdown log with syntax highlighting
- **Interventions**: Display pending and completed intervention requests
- **Micro-Plans**: List all micro-plans with status indicators
- **Live Feed**: Real-time event stream showing all updates

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Web Browser (http://localhost:3030)                    │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Frontend (HTML/CSS/JS)                           │  │
│  │  - Real-time UI updates                           │  │
│  │  - SSE connection                                 │  │
│  │  - Screenshot gallery                             │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                       ↕ SSE + REST API
┌─────────────────────────────────────────────────────────┐
│  Dashboard Server (Node.js + Express)                   │
│  ┌───────────────────────────────────────────────────┐  │
│  │  File Watchers (chokidar)                        │  │
│  │  - migration-log.md                               │  │
│  │  - screenshots/*.png                              │  │
│  │  - intervention/*.json                            │  │
│  │  - .claude-session-id                             │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                       ↕ Filesystem
┌─────────────────────────────────────────────────────────┐
│  Workspace (/Users/bfeister/dev/test-storefront)       │
│  - migration-log.md                                     │
│  - screenshots/                                         │
│  - intervention/                                        │
│  - .claude-session-id                                   │
│  - sub-plans/                                           │
└─────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Install Dependencies

```bash
cd dashboard
pnpm install
```

### 2. Start Dashboard

```bash
pnpm start
```

The dashboard will start on http://localhost:3030

### 3. Run Migration Loop

In a separate terminal:

```bash
cd ..
./scripts/demo-migration-loop.sh
```

The dashboard will automatically detect and display updates as the migration progresses.

## Configuration

### Environment Variables

- `DASHBOARD_PORT` - Port for the dashboard server (default: 3030)

### File Paths

The dashboard monitors the following files/directories relative to the workspace root:

- `migration-log.md` - Main progress log
- `screenshots/` - Screenshot artifacts
- `intervention/` - User intervention requests/responses
- `.claude-session-id` - Current Claude session ID
- `sub-plans/` - Micro-plan definitions

## Dashboard Sections

### Overview Cards

- **Status**: Current migration status and session ID
- **Progress**: Completion percentage with visual progress bar
- **Screenshots**: Total number of screenshots captured
- **Interventions**: Number of pending interventions requiring user input

### Tabs

#### 1. Micro-Plans

Lists all micro-plans with:
- Feature name
- Subplan number
- Status (✅ Completed, 🔄 In Progress, ⏳ Pending)

#### 2. Screenshots

Screenshot gallery with two modes:
- **Compare Mode** (default): Side-by-side source/target comparison
- **Single Mode**: Individual screenshots in grid layout

Features:
- Click to view full-size
- Grouped by subplan
- Sorted by most recent first

#### 3. Migration Log

Rendered markdown log showing:
- Completed micro-plans
- Status updates
- Error messages
- Timestamps

#### 4. Interventions

Shows all intervention requests:
- **Pending**: Awaiting user response (yellow border)
- **Completed**: User has responded (green border, dimmed)

Displays:
- Question text
- Available options
- Selected option (if completed)
- Timestamp and worker ID

### Live Feed

Real-time event stream at the bottom showing:
- New screenshots captured
- Migration log updates
- Intervention requests
- Session changes

Color-coded by event type:
- 🔵 Info (blue)
- 🟢 Success (green)
- 🟡 Warning (yellow)
- 🔴 Error (red)

## Screenshot Naming Convention

The dashboard parses screenshot filenames to extract metadata:

**Format**: `YYYYMMDD-HHMMSS-subplan-XX-YY-{source|target}.png`

Example: `20260122-154230-subplan-01-03-source.png`

Parsed as:
- Date: 2026-01-22
- Time: 15:42:30 UTC
- Feature: 01
- Subplan: 03
- Variant: source (SFRA)

Special case: `sfra-homepage-baseline.png` (baseline screenshot)

## API Endpoints

### REST API

- `GET /api/state` - Current state summary
- `GET /api/migration-log` - Migration log content (markdown + HTML)
- `GET /api/screenshots` - List all screenshots with metadata
- `GET /api/interventions` - Pending and completed interventions
- `GET /api/micro-plans` - All micro-plan definitions

### Server-Sent Events

- `GET /events` - SSE endpoint for real-time updates

Event types:
- `connected` - Client connected to server
- `migration-log` - Migration log updated
- `screenshot` - New screenshot captured
- `intervention-needed` - New intervention request
- `intervention-response` - Intervention response received
- `session` - Session ID changed

## Development

### Run with Auto-Reload

```bash
pnpm dev
```

Uses `nodemon` to automatically restart server on file changes.

### Directory Structure

```
dashboard/
├── server.js           # Express server + file watchers
├── package.json        # Dependencies
├── README.md          # This file
└── public/            # Static assets
    ├── index.html     # Dashboard UI
    ├── styles.css     # Styling
    └── app.js         # Frontend logic + SSE client
```

## Troubleshooting

### Dashboard not showing updates

1. Check that the migration loop is running
2. Verify file watchers are active (check server console logs)
3. Ensure workspace paths are correct
4. Check browser console for SSE connection errors

### Screenshots not displaying

1. Verify screenshots exist in `screenshots/` directory
2. Check screenshot filenames match the expected pattern
3. Ensure `/screenshots` static route is working

### SSE connection issues

1. Check that port 3030 is not in use
2. Verify no firewall blocking localhost connections
3. Try refreshing the page to reconnect

### Performance issues

1. Clear the live feed (use "Clear" button)
2. Reduce screenshot size/quality if needed
3. Limit number of screenshots displayed

## Browser Compatibility

- Chrome/Edge: ✅ Full support
- Firefox: ✅ Full support
- Safari: ✅ Full support
- IE11: ❌ Not supported (requires ES6+ and SSE)

## Future Enhancements

- [ ] WebSocket support for bidirectional communication
- [ ] Respond to interventions directly from dashboard
- [ ] Visual diff comparison for screenshots
- [ ] Export reports as PDF/HTML
- [ ] Historical data visualization
- [ ] Multi-project support
- [ ] Dark/light theme toggle
- [ ] Notifications (browser notifications API)
- [ ] Search/filter functionality

## License

MIT
