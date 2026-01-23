# Migration Dashboard - Integration Guide

## Overview

The Migration Dashboard is a real-time web interface for monitoring the SFRA to Storefront Next migration progress. It provides live updates on micro-plan execution, screenshot captures, interventions, and overall progress without requiring terminal monitoring.

## Quick Start

### 1. Start the Dashboard

```bash
cd dashboard
./start-dashboard.sh
```

Or manually:

```bash
cd dashboard
pnpm install  # First time only
pnpm start
```

The dashboard will be available at: **http://localhost:3030**

### 2. Start the Migration Loop

In a separate terminal:

```bash
cd /Users/bfeister/dev/test-storefront
./scripts/demo-migration-loop.sh
```

### 3. Monitor Progress

Open http://localhost:3030 in your browser. The dashboard will automatically:
- Connect via Server-Sent Events (SSE)
- Display current migration status
- Show live updates as files change
- Capture new screenshots
- Display intervention requests

## Dashboard Features

### Overview Cards (Top Row)

#### Status Card
- Overall migration status (🔄 In Progress, ✅ Complete, ❌ Error)
- Claude session ID (first 8 characters, hover for full ID)
- Last updated timestamp (relative time)

#### Progress Card
- Completed vs total micro-plans (e.g., "3 / 6 Micro-Plans")
- Visual progress bar
- Completion percentage

#### Screenshots Card
- Total number of screenshots captured
- Updates in real-time as new screenshots are added

#### Interventions Card
- Number of pending interventions requiring user input
- Turns yellow/orange when interventions are needed
- Returns to normal after response provided

### Tabs

#### 1. Micro-Plans Tab

Shows all micro-plans from `sub-plans/` directory:

```
┌────────────────────────────────────────────────────────┐
│ Analyze SFRA Homepage Baseline                         │
│ 01-homepage-content • subplan-01-01       ✅ Completed │
├────────────────────────────────────────────────────────┤
│ Document Existing Implementation                       │
│ 01-homepage-content • subplan-01-02       🔄 In Progress│
├────────────────────────────────────────────────────────┤
│ Adjust Hero Styling                                    │
│ 01-homepage-content • subplan-01-03       ⏳ Pending   │
└────────────────────────────────────────────────────────┘
```

Status indicators:
- ✅ **Completed**: Micro-plan successfully executed
- 🔄 **In Progress**: Currently executing
- ⏳ **Pending**: Not yet started

#### 2. Screenshots Tab

Visual gallery of all captured screenshots:

**Compare Mode** (default):
- Side-by-side source (SFRA) and target (Storefront Next) comparison
- Grouped by subplan
- Sorted by most recent first

**Single Mode**:
- Grid layout of individual screenshots
- Good for quick browsing

Features:
- Click any screenshot to view full-size
- Screenshots automatically appear as they're captured
- Timestamps show relative time (e.g., "2m ago", "1h ago")

#### 3. Migration Log Tab

Rendered markdown view of `migration-log.md`:
- Formatted with syntax highlighting
- Shows all completed micro-plans
- Displays status updates, errors, and notes
- Auto-updates when log file changes

#### 4. Interventions Tab

Shows all intervention requests:

**Pending Intervention** (yellow border):
```
❓ What color scheme for the hero section?

Options:
  □ Blue (matches SFRA)
  □ Green (brand color)
  □ Purple (modern alternative)

Pending • 2:45 PM • Worker: micro-iteration-worker
```

**Completed Intervention** (green border, dimmed):
```
✅ What color scheme for the hero section?

Options:
  ✓ Blue (matches SFRA)
  □ Green (brand color)
  □ Purple (modern alternative)

Completed • 2:45 PM • Worker: micro-iteration-worker
```

**Note**: The dashboard displays interventions but does not allow responding to them directly. You must respond via the terminal or intervention JSON files.

### Live Updates Feed (Bottom)

Real-time event stream showing:
- 🟢 Migration log updates
- 🟢 New screenshots captured
- 🟡 Intervention requests
- 🔵 Session changes
- 🔴 Errors

Example:
```
3:47:15 PM  New screenshot: 20260122-154715-subplan-01-03-target.png
3:47:10 PM  New screenshot: 20260122-154710-subplan-01-03-source.png
3:47:05 PM  Migration log updated
3:46:30 PM  Intervention requested: Select hero background color
```

Click "Clear" to clear the feed history.

## Integration with Migration Loop

### How It Works

```
┌─────────────────────────────────────────────────────────┐
│  Migration Loop (demo-migration-loop.sh)                │
│                                                          │
│  1. Claude Code executes micro-plan                     │
│  2. Writes to migration-log.md              ────────┐   │
│  3. Captures screenshots/*.png              ────────┤   │
│  4. Creates intervention/*.json if needed   ────────┤   │
│  5. Updates .claude-session-id              ────────┤   │
└─────────────────────────────────────────────────────┼───┘
                                                       │
                                          File changes detected
                                                       │
┌─────────────────────────────────────────────────────┼───┐
│  Dashboard Server (chokidar file watchers)         ↓   │
│                                                          │
│  - Detects file changes                                 │
│  - Broadcasts SSE events to connected clients           │
└─────────────────────────────────────────────────────┼───┘
                                                       │
                                          SSE events sent
                                                       │
┌─────────────────────────────────────────────────────┼───┐
│  Dashboard UI (browser)                            ↓   │
│                                                          │
│  - Receives SSE events                                  │
│  - Updates UI in real-time                              │
│  - No page refresh needed                               │
└──────────────────────────────────────────────────────────┘
```

### File Monitoring

The dashboard monitors these files/directories:

| Path | Purpose | Update Trigger |
|------|---------|----------------|
| `migration-log.md` | Progress log | Any change to file |
| `screenshots/*.png` | Visual artifacts | New file added |
| `intervention/*.json` | User prompts | New file added |
| `.claude-session-id` | Session tracking | File content changes |

### Screenshot Naming Convention

The dashboard parses screenshot filenames to extract metadata:

**Format**: `YYYYMMDD-HHMMSS-subplan-XX-YY-{source\|target}.png`

Example: `20260122-154230-subplan-01-03-source.png`

Parsed as:
- **Date**: 2026-01-22
- **Time**: 15:42:30 UTC
- **Feature**: 01 (homepage)
- **Subplan**: 03 (third micro-plan)
- **Variant**: source (SFRA baseline)

Special case: `sfra-homepage-baseline.png` (initial SFRA baseline)

## Workflow Examples

### Example 1: Normal Migration Run

1. **Start Dashboard**
   ```bash
   cd dashboard && ./start-dashboard.sh
   ```

2. **Open Browser**
   - Navigate to http://localhost:3030
   - Verify "Connected" status in top-right

3. **Start Migration**
   ```bash
   ./scripts/demo-migration-loop.sh
   ```

4. **Monitor Progress**
   - Watch progress bar increment
   - View screenshots as they're captured (Screenshots tab)
   - Check migration log for details (Migration Log tab)
   - See live updates in feed at bottom

5. **Migration Completes**
   - Progress shows "6 / 6 Micro-Plans"
   - All micro-plans show ✅ Completed
   - Final screenshots available for comparison

### Example 2: Intervention Required

1. **Dashboard detects intervention**
   - Interventions card shows "1 Pending" (turns yellow)
   - Live feed shows: "Intervention requested: [question]"
   - Interventions tab highlights pending request

2. **Respond to intervention**
   - Via terminal (demo-migration-loop.sh prompts you)
   - Or manually create `intervention/response-*.json`

3. **Dashboard updates**
   - Interventions card returns to "0 Pending"
   - Intervention moves to "Completed" state
   - Live feed shows: "Intervention response received"
   - Migration loop continues

### Example 3: Debugging Failed Micro-Plan

1. **Dashboard shows error**
   - Migration log shows ❌ status
   - Progress bar stops incrementing
   - Live feed shows error message

2. **Investigate**
   - Click Migration Log tab
   - Scroll to failed micro-plan section
   - Review error details and stack trace

3. **Check screenshots**
   - Switch to Screenshots tab
   - Find screenshots from failed subplan
   - Compare source vs target to identify issue

4. **Fix and retry**
   - Fix code issue
   - Restart migration loop
   - Monitor dashboard for success

## Configuration

### Environment Variables

Set these before starting the dashboard:

```bash
export DASHBOARD_PORT=3030  # Default port
```

Or pass directly:

```bash
DASHBOARD_PORT=8080 pnpm start
```

### Custom Workspace Path

If your workspace is not at the default location, the dashboard will use the parent directory of `dashboard/` as the workspace root.

To use a custom path, modify `server.js`:

```javascript
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, '..');
```

## Troubleshooting

### Dashboard not connecting

**Symptom**: "Disconnected" status in top-right

**Solutions**:
1. Check dashboard server is running (should show "Dashboard: http://localhost:3030")
2. Verify port 3030 is not in use: `lsof -i :3030`
3. Check browser console for errors (F12 → Console)
4. Try refreshing the page

### Screenshots not appearing

**Symptom**: Screenshots tab is empty or missing recent captures

**Solutions**:
1. Verify screenshots exist: `ls -la screenshots/`
2. Check filename matches pattern: `YYYYMMDD-HHMMSS-subplan-XX-YY-{source|target}.png`
3. Check browser console for 404 errors
4. Verify `/screenshots` static route is working: http://localhost:3030/screenshots/

### Migration log not updating

**Symptom**: Migration Log tab shows old content

**Solutions**:
1. Check `migration-log.md` exists and is being written to
2. Verify file watcher is active (check server console logs)
3. Click Migration Log tab to force refresh
4. Check server console for chokidar errors

### Live feed not showing updates

**Symptom**: Live Updates feed is empty or stale

**Solutions**:
1. Check SSE connection (browser Network tab → EventStream)
2. Verify file watchers are running (server console)
3. Click "Clear" to reset feed
4. Refresh page to reconnect SSE

### High memory usage

**Symptom**: Dashboard becomes slow after many updates

**Solutions**:
1. Clear live feed (click "Clear" button)
2. Reduce screenshot size/quality in capture script
3. Restart dashboard server periodically
4. Limit number of screenshots displayed

## Performance Tips

### Browser Performance

- Keep only one browser tab open
- Use Chrome/Edge for best SSE performance
- Clear live feed regularly (keeps last 50 items)
- Close dashboard when not actively monitoring

### Server Performance

- Dashboard uses minimal resources (~50MB RAM)
- File watchers are efficient (chokidar uses native OS events)
- SSE connections are lightweight (< 1KB/s idle)

### Network Usage

- Dashboard is local-only (no external requests)
- Screenshots served from local filesystem
- SSE events are small JSON payloads (< 1KB each)

## Advanced Usage

### Running on Different Port

```bash
DASHBOARD_PORT=8080 pnpm start
```

### Running in Background

```bash
nohup pnpm start > dashboard.log 2>&1 &
```

### Running with PM2

```bash
pm2 start server.js --name migration-dashboard
pm2 logs migration-dashboard
```

### Accessing from Another Device

1. Find your local IP: `ifconfig | grep inet`
2. Start dashboard: `pnpm start`
3. Access from other device: `http://YOUR_IP:3030`

**Note**: Ensure firewall allows incoming connections on port 3030

## API Usage (for custom integrations)

The dashboard exposes REST API endpoints:

### Get Current State

```bash
curl http://localhost:3030/api/state
```

Response:
```json
{
  "timestamp": "2026-01-22T20:30:45.123Z",
  "session": "8ddd0727-1af6-fc5b-f056-85506ece609a",
  "migrationLog": {
    "exists": true,
    "modified": "2026-01-22T20:30:12.000Z",
    "status": "🔄 In Progress",
    "completed": 3,
    "total": 6
  },
  "screenshots": {
    "count": 8,
    "latest": {
      "name": "20260122-203015-subplan-01-03-target.png",
      "modified": "2026-01-22T20:30:15.000Z"
    }
  },
  "interventions": {
    "pending": 0,
    "completed": 1
  }
}
```

### Get Screenshots

```bash
curl http://localhost:3030/api/screenshots
```

### Get Migration Log

```bash
curl http://localhost:3030/api/migration-log
```

### Listen to SSE Events

```bash
curl -N http://localhost:3030/events
```

## Next Steps

After setting up the dashboard:

1. **Run a test migration** - Execute demo-migration-loop.sh and watch the dashboard
2. **Explore features** - Click through all tabs to understand what's available
3. **Customize** - Modify styles.css for different themes or branding
4. **Extend** - Add custom API endpoints or dashboard features as needed

## Support

For issues or questions:
- Check this guide's Troubleshooting section
- Review `dashboard/README.md` for technical details
- Check server console logs for error messages
- Inspect browser console (F12) for client-side errors

---

**Happy Monitoring!** 🚀
