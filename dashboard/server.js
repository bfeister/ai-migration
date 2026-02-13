#!/usr/bin/env node
/**
 * Migration Dashboard Server
 *
 * Real-time dashboard that monitors filesystem changes and displays migration progress.
 * Uses Server-Sent Events (SSE) for live updates without page refresh.
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const chokidar = require('chokidar');
const { marked } = require('marked');

const app = express();
const PORT = process.env.DASHBOARD_PORT || 3030;

// Paths relative to workspace root
const WORKSPACE_ROOT = path.resolve(__dirname, '..');
const MIGRATION_LOG = path.join(WORKSPACE_ROOT, 'migration-log.md');
const SCREENSHOTS_DIR = path.join(WORKSPACE_ROOT, 'screenshots');
const INTERVENTION_DIR = path.join(WORKSPACE_ROOT, 'intervention');
const SESSION_ID_FILE = path.join(WORKSPACE_ROOT, '.claude-session-id');
const URL_MAPPINGS = path.join(WORKSPACE_ROOT, 'url-mappings.json');
const SUBPLANS_DIR = path.join(WORKSPACE_ROOT, 'sub-plans');
const PLANS_DIR = path.join(WORKSPACE_ROOT, 'plans');

// Store connected SSE clients
const clients = [];

// Middleware for parsing JSON request bodies
app.use(express.json());

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));
app.use('/screenshots', express.static(SCREENSHOTS_DIR));

// Tab routes - serve index.html for each tab path so refresh works
const TAB_ROUTES = ['/micro-plans', '/screenshots', '/log', '/interventions', '/plans'];
TAB_ROUTES.forEach(route => {
  app.get(route, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
});

// SSE endpoint for real-time updates
app.get('/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  // Add this client to the list
  clients.push(res);

  // Send initial state
  sendUpdate(res, 'connected', { message: 'Dashboard connected' });

  // Remove client on disconnect
  req.on('close', () => {
    const index = clients.indexOf(res);
    if (index !== -1) {
      clients.splice(index, 1);
    }
  });
});

// API endpoint: Get current state
app.get('/api/state', (req, res) => {
  res.json(getCurrentState());
});

// API endpoint: Get migration log
app.get('/api/migration-log', (req, res) => {
  if (fs.existsSync(MIGRATION_LOG)) {
    const content = fs.readFileSync(MIGRATION_LOG, 'utf-8');
    const html = marked(content);
    res.json({ content, html });
  } else {
    res.json({ content: '', html: '' });
  }
});

// API endpoint: Get screenshots
app.get('/api/screenshots', (req, res) => {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    return res.json([]);
  }

  const files = fs.readdirSync(SCREENSHOTS_DIR)
    .filter(f => f.endsWith('.png'))
    .map(filename => {
      const stats = fs.statSync(path.join(SCREENSHOTS_DIR, filename));
      const parsed = parseScreenshotFilename(filename);
      return {
        filename,
        url: `/screenshots/${filename}`,
        size: stats.size,
        modified: stats.mtime,
        ...parsed
      };
    })
    .sort((a, b) => new Date(b.modified) - new Date(a.modified));

  res.json(files);
});

// API endpoint: Get interventions
app.get('/api/interventions', (req, res) => {
  if (!fs.existsSync(INTERVENTION_DIR)) {
    return res.json([]);
  }

  const needed = fs.readdirSync(INTERVENTION_DIR)
    .filter(f => f.startsWith('needed-') && f.endsWith('.json'))
    .map(filename => {
      const content = fs.readFileSync(path.join(INTERVENTION_DIR, filename), 'utf-8');
      return {
        filename,
        workerId: filename.replace('needed-', '').replace('.json', ''),
        ...JSON.parse(content)
      };
    });

  const responses = fs.readdirSync(INTERVENTION_DIR)
    .filter(f => f.startsWith('response-') && f.endsWith('.json'))
    .map(filename => {
      const content = fs.readFileSync(path.join(INTERVENTION_DIR, filename), 'utf-8');
      return {
        filename,
        workerId: filename.replace('response-', '').replace('.json', ''),
        ...JSON.parse(content)
      };
    });

  res.json({ needed, responses });
});

// API endpoint: Submit intervention response
app.post('/api/interventions/:workerId/respond', (req, res) => {
  const { workerId } = req.params;
  const { selected_option } = req.body;

  if (!workerId || !selected_option) {
    return res.status(400).json({ error: 'Missing workerId or selected_option' });
  }

  // Check if intervention exists
  const neededFile = path.join(INTERVENTION_DIR, `needed-${workerId}.json`);
  if (!fs.existsSync(neededFile)) {
    return res.status(404).json({ error: `Intervention ${workerId} not found` });
  }

  // Read original intervention to get context
  const interventionData = JSON.parse(fs.readFileSync(neededFile, 'utf-8'));

  // Create response file
  const responseFile = path.join(INTERVENTION_DIR, `response-${workerId}.json`);
  const responseData = {
    worker_id: workerId,
    timestamp: new Date().toISOString(),
    response: selected_option,
    selected_option: selected_option,
    question_timestamp: interventionData.timestamp,
    intervention_id: workerId,
    processed: false
  };

  fs.writeFileSync(responseFile, JSON.stringify(responseData, null, 2), 'utf-8');

  console.log(`[Dashboard] Intervention response created: ${responseFile}`);

  // Broadcast SSE event
  broadcastUpdate('intervention-response', {
    worker_id: workerId,
    selected_option: selected_option
  });

  res.json({
    success: true,
    worker_id: workerId,
    selected_option,
    message: 'Response saved. Run: ./scripts/resume-migration.sh'
  });
});

// API endpoint: Get micro-plans
app.get('/api/micro-plans', (req, res) => {
  if (!fs.existsSync(SUBPLANS_DIR)) {
    return res.json([]);
  }

  const plans = [];
  const dirs = fs.readdirSync(SUBPLANS_DIR);

  for (const dir of dirs) {
    const dirPath = path.join(SUBPLANS_DIR, dir);
    if (!fs.statSync(dirPath).isDirectory()) continue;

    const files = fs.readdirSync(dirPath)
      .filter(f => f.endsWith('.md'))
      .map(filename => {
        const content = fs.readFileSync(path.join(dirPath, filename), 'utf-8');
        const match = filename.match(/subplan-(\d+)-(\d+)\.md/);
        return {
          filename,
          feature: dir,
          featureNum: match ? parseInt(match[1]) : 0,
          subplanNum: match ? parseInt(match[2]) : 0,
          title: extractTitle(content),
          path: path.join(dir, filename)
        };
      })
      .sort((a, b) => a.subplanNum - b.subplanNum);

    plans.push(...files);
  }

  res.json(plans);
});

// API endpoint: Get parent plans (prompts and responses)
app.get('/api/plans', (req, res) => {
  if (!fs.existsSync(PLANS_DIR)) {
    return res.json([]);
  }

  const files = fs.readdirSync(PLANS_DIR)
    .filter(f => f.endsWith('.md'))
    .map(filename => {
      const stats = fs.statSync(path.join(PLANS_DIR, filename));
      const parsed = parsePlanFilename(filename);
      return {
        filename,
        path: path.join('plans', filename),
        size: stats.size,
        modified: stats.mtime,
        ...parsed
      };
    })
    .sort((a, b) => new Date(b.modified) - new Date(a.modified));

  res.json(files);
});

// API endpoint: Get plan content
app.get('/api/plans/:filename', (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(PLANS_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Plan not found' });
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const html = marked(content);
  const parsed = parsePlanFilename(filename);

  res.json({
    filename,
    content,
    html,
    ...parsed
  });
});

// Helper: Parse plan filename
// Format: {pageId|featureId}-{discovery|subplan}-{prompt|response}-{timestamp}.md
function parsePlanFilename(filename) {
  // Discovery format: home-discovery-prompt-2026-02-13T14-30-01.md
  const discoveryMatch = filename.match(/^(.+)-(discovery)-(prompt|response)-(.+)\.md$/);
  if (discoveryMatch) {
    const [, pageId, type, variant, timestamp] = discoveryMatch;
    return {
      pageId,
      featureId: null,
      type: 'discovery',
      variant,
      timestamp
    };
  }

  // Sub-plan format: 01-home-hero-subplan-01-prompt-2026-02-13T14-30-01.md
  const subplanMatch = filename.match(/^(.+)-subplan-(\d+)-(prompt|response)-(.+)\.md$/);
  if (subplanMatch) {
    const [, featureId, subplanNum, variant, timestamp] = subplanMatch;
    return {
      pageId: null,
      featureId,
      subplanNum: parseInt(subplanNum),
      type: 'subplan',
      variant,
      timestamp
    };
  }

  return {
    pageId: null,
    featureId: null,
    type: 'unknown',
    variant: 'unknown',
    timestamp: null
  };
}

// Helper: Parse screenshot filename
// Format: YYYYMMDD-HHMMSS-subplan-XX-YY-{source|target}.png
// Baseline format: YYYYMMDD-HHMMSS-00-00-baseline-{source|target}.png
// Analysis format: YYYYMMDD-HHMMSS-XX-00-analysis-source.png
function parseScreenshotFilename(filename) {
  const match = filename.match(/(\d{8})-(\d{6})-subplan-(\d+)-(\d+)-(source|target)\.png/);

  if (!match) {
    // Try analysis format: YYYYMMDD-HHMMSS-XX-00-analysis-source.png
    const analysisMatch = filename.match(/(\d{8})-(\d{6})-(\d+)-(\d+)-analysis-(source|target)\.png/);
    if (analysisMatch) {
      const [, date, time, feature, subplan, variant] = analysisMatch;
      const year = date.substring(0, 4);
      const month = date.substring(4, 6);
      const day = date.substring(6, 8);
      const hour = time.substring(0, 2);
      const minute = time.substring(2, 4);
      const second = time.substring(4, 6);

      return {
        timestamp: new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`),
        type: 'analysis',
        featureNum: parseInt(feature),
        subplanNum: parseInt(subplan),
        variant
      };
    }

    // Try baseline format: YYYYMMDD-HHMMSS-XX-YY-baseline-{source|target}.png
    const baselineMatch = filename.match(/(\d{8})-(\d{6})-(\d+)-(\d+)-baseline-(source|target)\.png/);
    if (baselineMatch) {
      const [, date, time, feature, subplan, variant] = baselineMatch;
      const year = date.substring(0, 4);
      const month = date.substring(4, 6);
      const day = date.substring(6, 8);
      const hour = time.substring(0, 2);
      const minute = time.substring(2, 4);
      const second = time.substring(4, 6);

      return {
        timestamp: new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`),
        type: 'baseline',
        featureNum: parseInt(feature),
        subplanNum: parseInt(subplan),
        variant: variant
      };
    }

    // Fallback for old baseline format: sfra-homepage-baseline.png
    if (filename.includes('baseline')) {
      return {
        timestamp: null,
        type: 'baseline',
        featureNum: 0,
        subplanNum: 0,
        variant: 'source'
      };
    }

    return {
      timestamp: null,
      type: 'unknown',
      featureNum: 0,
      subplanNum: 0,
      variant: 'unknown'
    };
  }

  const [, date, time, feature, subplan, variant] = match;
  const year = date.substring(0, 4);
  const month = date.substring(4, 6);
  const day = date.substring(6, 8);
  const hour = time.substring(0, 2);
  const minute = time.substring(2, 4);
  const second = time.substring(4, 6);

  return {
    timestamp: new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`),
    type: 'iteration',
    featureNum: parseInt(feature),
    subplanNum: parseInt(subplan),
    variant
  };
}

// Helper: Extract title from markdown content
function extractTitle(content) {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1] : 'Untitled';
}

// Helper: Get current state
function getCurrentState() {
  const state = {
    timestamp: new Date().toISOString(),
    session: null,
    migrationLog: {
      exists: fs.existsSync(MIGRATION_LOG),
      modified: null,
      status: null,
      completed: 0,
      total: 0
    },
    screenshots: {
      count: 0,
      latest: null
    },
    interventions: {
      pending: 0,
      completed: 0
    }
  };

  // Session ID
  if (fs.existsSync(SESSION_ID_FILE)) {
    state.session = fs.readFileSync(SESSION_ID_FILE, 'utf-8').trim();
  }

  // Migration log
  if (fs.existsSync(MIGRATION_LOG)) {
    const stats = fs.statSync(MIGRATION_LOG);
    const content = fs.readFileSync(MIGRATION_LOG, 'utf-8');

    state.migrationLog.modified = stats.mtime;

    // Parse status
    const statusMatch = content.match(/\*\*Status:\*\*\s+(.+)/);
    if (statusMatch) {
      state.migrationLog.status = statusMatch[1];
    }

    // Parse completed count
    const completedMatch = content.match(/\*\*Completed Micro-Plans:\*\*\s+(\d+)\s+\/\s+(\d+)/);
    if (completedMatch) {
      state.migrationLog.completed = parseInt(completedMatch[1]);
      state.migrationLog.total = parseInt(completedMatch[2]);
    }
  }

  // Screenshots
  if (fs.existsSync(SCREENSHOTS_DIR)) {
    const files = fs.readdirSync(SCREENSHOTS_DIR)
      .filter(f => f.endsWith('.png'))
      .map(f => ({
        name: f,
        modified: fs.statSync(path.join(SCREENSHOTS_DIR, f)).mtime
      }))
      .sort((a, b) => b.modified - a.modified);

    state.screenshots.count = files.length;
    state.screenshots.latest = files[0] || null;
  }

  // Interventions
  if (fs.existsSync(INTERVENTION_DIR)) {
    const needed = fs.readdirSync(INTERVENTION_DIR)
      .filter(f => f.startsWith('needed-') && f.endsWith('.json'));
    const responses = fs.readdirSync(INTERVENTION_DIR)
      .filter(f => f.startsWith('response-') && f.endsWith('.json'));

    state.interventions.pending = needed.length;
    state.interventions.completed = responses.length;
  }

  return state;
}

// Helper: Send SSE update to all clients
function broadcastUpdate(event, data) {
  clients.forEach(client => sendUpdate(client, event, data));
}

function sendUpdate(client, event, data) {
  client.write(`event: ${event}\n`);
  client.write(`data: ${JSON.stringify(data)}\n\n`);
}

// File watchers
function setupWatchers() {
  console.log('Setting up file watchers...');

  // Watch migration log
  if (fs.existsSync(MIGRATION_LOG)) {
    chokidar.watch(MIGRATION_LOG, { ignoreInitial: true })
      .on('change', () => {
        console.log('Migration log updated');
        broadcastUpdate('migration-log', getCurrentState().migrationLog);
      });
  }

  // Watch screenshots directory
  if (fs.existsSync(SCREENSHOTS_DIR)) {
    chokidar.watch(path.join(SCREENSHOTS_DIR, '*.png'), { ignoreInitial: true })
      .on('add', (filepath) => {
        const filename = path.basename(filepath);
        console.log('New screenshot:', filename);
        broadcastUpdate('screenshot', {
          filename,
          url: `/screenshots/${filename}`,
          ...parseScreenshotFilename(filename)
        });
      });
  }

  // Watch intervention directory
  if (fs.existsSync(INTERVENTION_DIR)) {
    chokidar.watch(path.join(INTERVENTION_DIR, '*.json'), { ignoreInitial: true })
      .on('add', (filepath) => {
        const filename = path.basename(filepath);
        console.log('New intervention file:', filename);

        if (filename.startsWith('needed-')) {
          const content = fs.readFileSync(filepath, 'utf-8');
          broadcastUpdate('intervention-needed', {
            filename,
            ...JSON.parse(content)
          });
        } else if (filename.startsWith('response-')) {
          const content = fs.readFileSync(filepath, 'utf-8');
          broadcastUpdate('intervention-response', {
            filename,
            ...JSON.parse(content)
          });
        }
      });
  }

  // Watch plans directory
  if (fs.existsSync(PLANS_DIR)) {
    chokidar.watch(path.join(PLANS_DIR, '*.md'), { ignoreInitial: true })
      .on('add', (filepath) => {
        const filename = path.basename(filepath);
        console.log('New plan file:', filename);
        const parsed = parsePlanFilename(filename);
        broadcastUpdate('plan', {
          filename,
          path: path.join('plans', filename),
          ...parsed
        });
      });
  } else {
    // Watch for plans directory creation
    chokidar.watch(WORKSPACE_ROOT, { ignoreInitial: true, depth: 0 })
      .on('addDir', (dirpath) => {
        if (path.basename(dirpath) === 'plans') {
          console.log('Plans directory created, setting up watcher...');
          chokidar.watch(path.join(PLANS_DIR, '*.md'), { ignoreInitial: true })
            .on('add', (filepath) => {
              const filename = path.basename(filepath);
              console.log('New plan file:', filename);
              const parsed = parsePlanFilename(filename);
              broadcastUpdate('plan', {
                filename,
                path: path.join('plans', filename),
                ...parsed
              });
            });
        }
      });
  }

  // Watch session ID file
  if (fs.existsSync(SESSION_ID_FILE)) {
    chokidar.watch(SESSION_ID_FILE, { ignoreInitial: true })
      .on('change', () => {
        const sessionId = fs.readFileSync(SESSION_ID_FILE, 'utf-8').trim();
        console.log('Session ID updated:', sessionId);
        broadcastUpdate('session', { sessionId });
      });
  }

  console.log('File watchers active');
}

// Start server
app.listen(PORT, () => {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                  Migration Dashboard                       ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  🌐 Dashboard: http://localhost:${PORT}`);
  console.log(`  📂 Workspace: ${WORKSPACE_ROOT}`);
  console.log('');
  console.log('  Monitoring:');
  console.log(`    • Migration log: ${MIGRATION_LOG}`);
  console.log(`    • Screenshots:   ${SCREENSHOTS_DIR}`);
  console.log(`    • Interventions: ${INTERVENTION_DIR}`);
  console.log(`    • Plans:         ${PLANS_DIR}`);
  console.log('');
  console.log('  Press Ctrl+C to stop');
  console.log('');

  setupWatchers();
});
