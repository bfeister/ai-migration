# Migration Dashboard - Quick Start

## 🚀 Launch in 30 Seconds

### Option 1: Dashboard + Migration Together (Recommended)

```bash
./scripts/start-with-dashboard.sh
```

This will:
1. ✅ Install dashboard dependencies (if needed)
2. ✅ Start dashboard server on http://localhost:3030
3. ✅ Open dashboard in your browser
4. ✅ Prompt you to start migration loop

### Option 2: Dashboard Only

```bash
cd dashboard
./start-dashboard.sh
```

Then start migration separately:

```bash
./scripts/demo-migration-loop.sh
```

### Option 3: Manual

```bash
# Terminal 1: Dashboard
cd dashboard
pnpm install  # First time only
pnpm start

# Terminal 2: Migration
./scripts/demo-migration-loop.sh
```

## 📊 What You'll See

### Dashboard Home (http://localhost:3030)

```
┌────────────────────────────────────────────────────────────┐
│  🚀 Migration Dashboard              ● Connected           │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐      │
│  │   Status     │ │   Progress   │ │ Screenshots  │      │
│  │ 🔄 In Progress│ │    3 / 6    │ │      8       │      │
│  │              │ │   [▓▓▓░░░]  │ │   Captured   │      │
│  │ Session: 8ddd│ │     50%     │ │              │      │
│  └──────────────┘ └──────────────┘ └──────────────┘      │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ Tabs:  [Micro-Plans] Screenshots  Log  Interventions│  │
│  │                                                      │  │
│  │  ✅ Analyze SFRA Baseline          subplan-01-01   │  │
│  │  🔄 Document Implementation        subplan-01-02   │  │
│  │  ⏳ Adjust Hero Styling            subplan-01-03   │  │
│  │  ⏳ Adjust Featured Products       subplan-01-04   │  │
│  │  ⏳ Adjust Spacing                 subplan-01-05   │  │
│  │  ⏳ Final Verification             subplan-01-06   │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ Live Updates                                        │  │
│  │ 3:47:15 PM  🟢 New screenshot: ...target.png       │  │
│  │ 3:47:10 PM  🟢 New screenshot: ...source.png       │  │
│  │ 3:47:05 PM  🟢 Migration log updated               │  │
│  └─────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

## 🎯 Key Features

### 1. Real-Time Updates
- No page refresh needed
- Updates appear instantly (< 200ms)
- Live event feed at bottom

### 2. Visual Progress
- Progress bar shows completion %
- Micro-plans list with status (✅/🔄/⏳)
- Screenshot count updates in real-time

### 3. Screenshot Gallery
Click **Screenshots** tab to see:
- Side-by-side SFRA vs Storefront Next comparison
- Click any screenshot for full-size view
- Automatically grouped by subplan

### 4. Migration Log
Click **Log** tab to see:
- Rendered markdown with formatting
- Completed micro-plans
- Error messages and status updates

### 5. Interventions
Click **Interventions** tab to see:
- Pending interventions (yellow border)
- Completed interventions (green border)
- Question text and available options

## 🔧 Common Tasks

### View Latest Screenshot

1. Open http://localhost:3030
2. Click **Screenshots** tab
3. First item is most recent
4. Click image for full-size

### Check Migration Status

1. Look at **Status** card (top-left)
2. Check **Progress** bar
3. Click **Micro-Plans** tab for details

### See What's Happening Right Now

1. Scroll to bottom
2. **Live Updates** feed shows real-time events
3. Color-coded: 🟢 Success, 🟡 Warning, 🔵 Info, 🔴 Error

### Review Completed Work

1. Click **Log** tab
2. Scroll to see all completed micro-plans
3. Each entry shows:
   - Timestamp
   - Status (✅ Success / ❌ Failed)
   - Duration
   - Notes

### Respond to Intervention

**Note**: Dashboard displays interventions but cannot respond directly.

To respond:
1. Go to terminal running `demo-migration-loop.sh`
2. Script will prompt you interactively
3. Dashboard updates automatically after response

## ⚡ Performance Tips

### Keep Dashboard Responsive

- Clear live feed periodically (click "Clear" button)
- Close dashboard when not monitoring
- Use Chrome/Edge for best performance

### Reduce Memory Usage

- Dashboard uses ~50MB RAM
- Grows to ~80MB with many screenshots
- Restart dashboard if it becomes slow

## 🐛 Troubleshooting

### Dashboard Won't Start

```bash
# Check if port 3030 is in use
lsof -i :3030

# If in use, kill the process
kill $(lsof -t -i:3030)

# Try again
./start-dashboard.sh
```

### "Disconnected" Status

1. Check dashboard server is running
2. Look at terminal for error messages
3. Refresh browser page
4. Check browser console (F12)

### Screenshots Not Showing

1. Verify screenshots exist: `ls screenshots/`
2. Check filename pattern matches
3. Click Screenshots tab to refresh
4. Check browser console for 404 errors

### Migration Log Not Updating

1. Click **Log** tab to force refresh
2. Check `migration-log.md` exists
3. Look at dashboard server console
4. Verify file watcher is active

## 📖 Documentation

- **QUICKSTART.md** - This file (you are here!)
- **README.md** - Technical details, API reference
- **../DASHBOARD-GUIDE.md** - Comprehensive integration guide
- **../DASHBOARD-SUMMARY.md** - Architecture and design decisions

## 🎬 Demo Video (Conceptual)

```
Time    | Action                          | Dashboard Shows
--------|--------------------------------|------------------
0:00    | Start dashboard                | "Connected" status
0:05    | Start migration loop           | Progress: 0 / 6
0:30    | Subplan 01-01 completes        | Progress: 1 / 6, ✅
2:15    | Screenshot captured            | Gallery updates, count +2
2:30    | Subplan 01-02 completes        | Progress: 2 / 6
4:45    | Intervention requested         | Yellow alert, count +1
5:00    | User responds (terminal)       | Alert clears
5:15    | Subplan 01-03 completes        | Progress: 3 / 6
...     | ...                            | ...
15:00   | All 6 subplans complete        | Progress: 6 / 6, 100%
```

## 🚦 Status Indicators

| Symbol | Meaning | Where You'll See It |
|--------|---------|-------------------|
| ✅ | Completed | Micro-plans, interventions |
| 🔄 | In Progress | Status badge, micro-plans |
| ⏳ | Pending | Micro-plans not yet started |
| ❌ | Failed | Migration log, status |
| 🟢 | Success Event | Live feed (green border) |
| 🟡 | Warning Event | Live feed (yellow border) |
| 🔵 | Info Event | Live feed (blue border) |
| 🔴 | Error Event | Live feed (red border) |
| ● | Connected | Connection status (green dot) |
| ○ | Disconnected | Connection status (gray dot) |

## 💡 Pro Tips

1. **Keep browser tab pinned**: Easy access while working
2. **Use Compare Mode**: Toggle on for side-by-side screenshots
3. **Monitor Live Feed**: Fastest way to see what's happening
4. **Clear feed regularly**: Keeps dashboard responsive
5. **Check Log tab for errors**: Most detailed error information
6. **Watch Progress bar**: Quick visual status at a glance

## 🎓 Learn More

- **How it works**: See `../DASHBOARD-SUMMARY.md`
- **API endpoints**: See `README.md`
- **Integration**: See `../DASHBOARD-GUIDE.md`
- **Troubleshooting**: See `../DASHBOARD-GUIDE.md#troubleshooting`

## ✨ You're Ready!

Now run:

```bash
./scripts/start-with-dashboard.sh
```

And watch the magic happen! 🚀

---

**Need help?** Check the troubleshooting section or review the full documentation.
