/**
 * Migration Dashboard - Frontend Application
 *
 * Handles real-time updates via Server-Sent Events (SSE)
 * and renders migration progress, screenshots, and logs.
 */

// ========================================
// State Management
// ========================================

const state = {
  connected: false,
  session: null,
  migrationLog: {
    status: null,
    completed: 0,
    total: 0,
    modified: null
  },
  screenshots: [],
  interventions: {
    needed: [],
    responses: []
  },
  microPlans: [],
  feedItems: []
};

// ========================================
// SSE Connection
// ========================================

let eventSource = null;
let reconnectTimeout = null;
let isReconnecting = false;

function connectSSE() {
  // Prevent multiple simultaneous connection attempts
  if (isReconnecting) {
    console.log('Reconnection already in progress, skipping...');
    return;
  }

  // Clean up existing connection
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }

  // Clear any pending reconnection attempts
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  console.log('Connecting to SSE...');
  eventSource = new EventSource('/events');

  eventSource.addEventListener('connected', (e) => {
    console.log('Connected to dashboard server');
    isReconnecting = false;
    updateConnectionStatus(true);
    loadInitialData();
  });

  eventSource.addEventListener('migration-log', (e) => {
    const data = JSON.parse(e.data);
    console.log('Migration log updated:', data);
    state.migrationLog = data;
    updateOverview();
    if (isTabActive('log')) {
      loadMigrationLog();
    }
    addFeedItem('success', 'Migration log updated');
  });

  eventSource.addEventListener('screenshot', (e) => {
    const data = JSON.parse(e.data);
    console.log('New screenshot:', data.filename);
    loadScreenshots();
    addFeedItem('success', `New screenshot: ${data.filename}`);
  });

  eventSource.addEventListener('intervention-needed', (e) => {
    const data = JSON.parse(e.data);
    console.log('Intervention needed:', data);
    loadInterventions();
    addFeedItem('warning', `Intervention requested: ${data.question || 'Unknown'}`);
  });

  eventSource.addEventListener('intervention-response', (e) => {
    const data = JSON.parse(e.data);
    console.log('Intervention response:', data);
    loadInterventions();
    addFeedItem('info', 'Intervention response received');
  });

  eventSource.addEventListener('session', (e) => {
    const data = JSON.parse(e.data);
    console.log('Session updated:', data.sessionId);
    state.session = data.sessionId;
    updateOverview();
  });

  eventSource.onerror = (error) => {
    console.error('SSE connection error:', error);
    updateConnectionStatus(false);

    // Only schedule one reconnection attempt
    if (!isReconnecting && !reconnectTimeout) {
      isReconnecting = true;
      console.log('Will attempt to reconnect in 5 seconds...');

      reconnectTimeout = setTimeout(() => {
        reconnectTimeout = null;
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        connectSSE();
      }, 5000);
    }
  };
}

function updateConnectionStatus(connected) {
  state.connected = connected;
  const statusDot = document.getElementById('connection-status');
  const statusText = document.getElementById('connection-text');

  if (connected) {
    statusDot.classList.add('connected');
    statusText.textContent = 'Connected';
  } else {
    statusDot.classList.remove('connected');
    statusText.textContent = 'Disconnected';
  }
}

// ========================================
// Data Loading
// ========================================

async function loadInitialData() {
  await Promise.all([
    loadState(),
    loadMicroPlans(),
    loadScreenshots(),
    loadInterventions()
  ]);

  // Load migration log if tab is active
  if (isTabActive('log')) {
    await loadMigrationLog();
  }
}

async function loadState() {
  try {
    const response = await fetch('/api/state');
    const data = await response.json();

    state.session = data.session;
    state.migrationLog = data.migrationLog;

    updateOverview();
  } catch (error) {
    console.error('Failed to load state:', error);
  }
}

async function loadMicroPlans() {
  try {
    const response = await fetch('/api/micro-plans');
    const plans = await response.json();
    state.microPlans = plans;
    renderMicroPlans();
  } catch (error) {
    console.error('Failed to load micro-plans:', error);
    showError('micro-plans-list', 'Failed to load micro-plans');
  }
}

async function loadScreenshots() {
  try {
    const response = await fetch('/api/screenshots');
    const screenshots = await response.json();
    state.screenshots = screenshots;
    renderScreenshots();
    updateScreenshotCount();
  } catch (error) {
    console.error('Failed to load screenshots:', error);
    showError('screenshots-gallery', 'Failed to load screenshots');
  }
}

async function loadMigrationLog() {
  try {
    const response = await fetch('/api/migration-log');
    const data = await response.json();
    renderMigrationLog(data.html);
  } catch (error) {
    console.error('Failed to load migration log:', error);
    showError('migration-log-content', 'Failed to load migration log');
  }
}

async function loadInterventions() {
  try {
    const response = await fetch('/api/interventions');
    const data = await response.json();
    state.interventions = data;
    renderInterventions();
    updateInterventionCount();
  } catch (error) {
    console.error('Failed to load interventions:', error);
    showError('interventions-list', 'Failed to load interventions');
  }
}

// ========================================
// Rendering Functions
// ========================================

function updateOverview() {
  // Overall status
  document.getElementById('overall-status').textContent = state.migrationLog.status || '🔄 In Progress';

  // Session ID
  const sessionEl = document.getElementById('session-id');
  if (state.session) {
    sessionEl.textContent = state.session.substring(0, 8) + '...';
    sessionEl.title = state.session;
  } else {
    sessionEl.textContent = '—';
  }

  // Last updated
  const lastUpdatedEl = document.getElementById('last-updated');
  if (state.migrationLog.modified) {
    lastUpdatedEl.textContent = formatRelativeTime(new Date(state.migrationLog.modified));
  } else {
    lastUpdatedEl.textContent = '—';
  }

  // Progress
  const completed = state.migrationLog.completed || 0;
  const total = state.migrationLog.total || 0;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  document.getElementById('completed-count').textContent = completed;
  document.getElementById('total-count').textContent = total;
  document.getElementById('progress-percentage').textContent = percentage + '%';
  document.getElementById('progress-fill').style.width = percentage + '%';
}

function updateScreenshotCount() {
  const count = state.screenshots.length;
  document.getElementById('screenshot-count').textContent = count;
}

function updateInterventionCount() {
  const count = state.interventions.needed.length;
  const el = document.getElementById('intervention-count');
  el.textContent = count;

  if (count > 0) {
    el.classList.add('warning');
  } else {
    el.classList.remove('warning');
  }
}

function renderMicroPlans() {
  const container = document.getElementById('micro-plans-list');

  if (state.microPlans.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div><div class="empty-state-text">No micro-plans found</div></div>';
    return;
  }

  const html = state.microPlans.map(plan => {
    const status = getSubplanStatus(plan.featureNum, plan.subplanNum);
    const statusClass = status === 'completed' ? 'completed' : status === 'in-progress' ? 'in-progress' : 'pending';
    const statusText = status === 'completed' ? '✅ Completed' : status === 'in-progress' ? '🔄 In Progress' : '⏳ Pending';

    return `
      <div class="micro-plan-item">
        <div class="micro-plan-info">
          <div class="micro-plan-title">${plan.title}</div>
          <div class="micro-plan-meta">
            ${plan.feature} • subplan-${String(plan.featureNum).padStart(2, '0')}-${String(plan.subplanNum).padStart(2, '0')}
          </div>
        </div>
        <div class="micro-plan-status ${statusClass}">${statusText}</div>
      </div>
    `;
  }).join('');

  container.innerHTML = html;
}

function renderScreenshots() {
  const container = document.getElementById('screenshots-gallery');
  const compareMode = document.getElementById('compare-mode').checked;

  if (state.screenshots.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📸</div><div class="empty-state-text">No screenshots captured yet</div></div>';
    return;
  }

  // Group screenshots by subplan (source + target pairs)
  const groups = {};

  state.screenshots.forEach(screenshot => {
    if (screenshot.type === 'baseline') {
      groups['baseline'] = groups['baseline'] || {};
      groups['baseline'][screenshot.variant] = screenshot;
    } else if (screenshot.type === 'iteration') {
      const key = `${screenshot.featureNum}-${screenshot.subplanNum}`;
      groups[key] = groups[key] || {};
      groups[key][screenshot.variant] = screenshot;
    }
  });

  const html = Object.entries(groups)
    .sort((a, b) => {
      // Sort by feature/subplan number (descending for most recent first)
      if (a[0] === 'baseline') return 1;
      if (b[0] === 'baseline') return -1;
      return b[0].localeCompare(a[0]);
    })
    .map(([key, screenshots]) => {
      const title = key === 'baseline' ? 'SFRA Baseline' : `Subplan ${key.replace('-', '-')}`;
      const source = screenshots.source;
      const target = screenshots.target;

      let imagesHtml = '';

      if (compareMode && source && target) {
        // Side-by-side comparison
        imagesHtml = `
          <div class="screenshot-compare">
            <div class="screenshot-item">
              <div class="screenshot-label source">Source (SFRA)</div>
              <img src="${source.url}" alt="Source screenshot" class="screenshot-image" onclick="openImageModal('${source.url}')">
            </div>
            <div class="screenshot-item">
              <div class="screenshot-label target">Target (Storefront Next)</div>
              <img src="${target.url}" alt="Target screenshot" class="screenshot-image" onclick="openImageModal('${target.url}')">
            </div>
          </div>
        `;
      } else {
        // Individual screenshots
        const items = [source, target].filter(Boolean).map(screenshot => `
          <div class="screenshot-item">
            <div class="screenshot-label ${screenshot.variant}">${screenshot.variant === 'source' ? 'Source (SFRA)' : 'Target (Storefront Next)'}</div>
            <img src="${screenshot.url}" alt="${screenshot.variant} screenshot" class="screenshot-image" onclick="openImageModal('${screenshot.url}')">
          </div>
        `).join('');

        imagesHtml = `<div class="screenshot-compare">${items}</div>`;
      }

      const timestamp = source?.timestamp || target?.timestamp;
      const timeStr = timestamp ? formatRelativeTime(new Date(timestamp)) : 'Unknown time';

      return `
        <div class="screenshot-group">
          <div class="screenshot-group-header">
            <div class="screenshot-group-title">${title}</div>
            <div class="screenshot-group-meta">${timeStr}</div>
          </div>
          ${imagesHtml}
        </div>
      `;
    }).join('');

  container.innerHTML = html;
}

function renderMigrationLog(html) {
  const container = document.getElementById('migration-log-content');

  if (!html) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📝</div><div class="empty-state-text">No migration log available</div></div>';
    return;
  }

  container.innerHTML = html;
}

function renderInterventions() {
  const container = document.getElementById('interventions-list');
  const { needed, responses } = state.interventions;

  if (needed.length === 0 && responses.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✅</div><div class="empty-state-text">No interventions requested</div></div>';
    return;
  }

  // Filter out interventions that have been responded to
  const pendingNeeded = needed.filter(n => !responses.some(r => r.worker_id === n.worker_id || r.workerId === n.workerId));

  // Build completed interventions by matching responses with their original needed files
  const completedInterventions = responses.map(response => {
    const workerId = response.workerId || response.worker_id;
    const original = needed.find(n => (n.workerId || n.worker_id) === workerId);

    // If we can't find the original, return a minimal object with the response data
    if (!original) {
      return {
        ...response,
        question: response.question || 'Question not available (intervention archived)',
        options: response.options || []
      };
    }

    // Merge original intervention with response data
    return {
      ...original,
      ...response,
      completed: true
    };
  });

  // Show pending interventions first (interactive), then completed ones (read-only)
  const html = [
    ...pendingNeeded.map(intervention => renderIntervention(intervention, false)),
    ...completedInterventions.map(intervention => renderIntervention(intervention, true))
  ].join('');

  container.innerHTML = html;

  // Attach event listeners to submit buttons
  document.querySelectorAll('.btn-respond').forEach(btn => {
    btn.addEventListener('click', handleInterventionSubmit);
  });
}

function renderIntervention(intervention, completed) {
  const options = intervention.options || [];
  const selectedOption = completed ? intervention.selected_option || intervention.response : null;
  const workerId = intervention.workerId || intervention.worker_id || 'unknown';

  let optionsHtml;
  if (completed) {
    // Read-only display for completed interventions
    optionsHtml = options.map(option => {
      const optionId = typeof option === 'string' ? option : option.id;
      const optionLabel = typeof option === 'string' ? option : option.label || option.id;
      const isSelected = selectedOption === optionId;

      return `
        <div class="intervention-option ${isSelected ? 'selected' : ''}">
          ${isSelected ? '✓ ' : ''}${optionLabel}
        </div>
      `;
    }).join('');
  } else {
    // Interactive radio buttons for pending interventions
    optionsHtml = options.map((option, idx) => {
      const optionId = typeof option === 'string' ? option : option.id;
      const optionLabel = typeof option === 'string' ? option : option.label || option.id;

      return `
        <div class="intervention-option clickable">
          <input type="radio" name="intervention-${workerId}" value="${optionId}" id="opt-${workerId}-${idx}">
          <label for="opt-${workerId}-${idx}">${optionLabel}</label>
        </div>
      `;
    }).join('');
  }

  const timestamp = intervention.timestamp ? new Date(intervention.timestamp).toLocaleString() : 'Unknown time';
  const context = intervention.context ? `<div class="intervention-context">${intervention.context}</div>` : '';

  return `
    <div class="intervention-item ${completed ? 'completed' : 'pending'}">
      <div class="intervention-question">
        ${completed ? '✅ ' : '❓ '}${intervention.question || 'Question not available'}
      </div>
      ${context}
      <div class="intervention-options">
        ${optionsHtml}
      </div>
      ${!completed ? `<button class="btn-respond" data-worker-id="${workerId}">Submit Response</button>` : ''}
      <div class="intervention-meta">
        ${completed ? 'Completed' : 'Pending'} • ${timestamp} • Worker: ${workerId}
      </div>
    </div>
  `;
}

async function handleInterventionSubmit(event) {
  const btn = event.target;
  const workerId = btn.dataset.workerId;
  const selectedRadio = document.querySelector(`input[name="intervention-${workerId}"]:checked`);

  if (!selectedRadio) {
    alert('Please select an option before submitting');
    return;
  }

  const selectedOption = selectedRadio.value;

  // Disable button during submission
  btn.disabled = true;
  btn.textContent = 'Submitting...';

  try {
    const response = await fetch(`/api/interventions/${workerId}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selected_option: selectedOption })
    });

    if (!response.ok) {
      throw new Error(`Failed to submit response: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Intervention response submitted:', data);

    // Reload interventions to show updated state
    await loadInterventions();

    // Show success message
    addFeedItem('success', `Intervention resolved: ${selectedOption}. Run ./scripts/resume-migration.sh to continue.`);
  } catch (error) {
    console.error('Error submitting intervention response:', error);
    alert(`Failed to submit response: ${error.message}`);
    btn.disabled = false;
    btn.textContent = 'Submit Response';
  }
}

// ========================================
// Live Feed
// ========================================

function addFeedItem(type, message) {
  const time = new Date().toLocaleTimeString();
  const item = {
    time,
    type,
    message,
    id: Date.now()
  };

  state.feedItems.unshift(item);

  // Keep only last 50 items
  if (state.feedItems.length > 50) {
    state.feedItems = state.feedItems.slice(0, 50);
  }

  renderFeed();
}

function renderFeed() {
  const container = document.getElementById('live-feed');

  const html = state.feedItems.map(item => `
    <div class="feed-item feed-item-${item.type}">
      <span class="feed-time">${item.time}</span>
      <span class="feed-message">${item.message}</span>
    </div>
  `).join('');

  container.innerHTML = html || '<div class="feed-item feed-item-info"><span class="feed-time">${new Date().toLocaleTimeString()}</span><span class="feed-message">No updates yet</span></div>';
}

// ========================================
// Tabs
// ========================================

function setupTabs() {
  const tabs = document.querySelectorAll('.tab');
  const contents = document.querySelectorAll('.tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;

      // Update active tab
      tabs.forEach(t => t.classList.remove('tab-active'));
      tab.classList.add('tab-active');

      // Update active content
      contents.forEach(c => c.classList.remove('tab-content-active'));
      document.getElementById(`tab-${tabName}`).classList.add('tab-content-active');

      // Load data if needed
      if (tabName === 'log') {
        loadMigrationLog();
      }
    });
  });
}

function isTabActive(tabName) {
  const tab = document.querySelector(`.tab[data-tab="${tabName}"]`);
  return tab && tab.classList.contains('tab-active');
}

// ========================================
// Helpers
// ========================================

function getSubplanStatus(featureNum, subplanNum) {
  // Parse migration log to determine status
  // For now, just return pending (this should be enhanced with actual log parsing)
  const completed = state.migrationLog.completed || 0;
  const subplanIndex = (featureNum - 1) * 6 + subplanNum; // Assuming 6 subplans per feature

  if (subplanIndex <= completed) {
    return 'completed';
  } else if (subplanIndex === completed + 1) {
    return 'in-progress';
  } else {
    return 'pending';
  }
}

function formatRelativeTime(date) {
  const now = new Date();
  const diff = now - date;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function openImageModal(url) {
  // Simple modal to view full-size image
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:pointer;';

  const img = document.createElement('img');
  img.src = url;
  img.style.cssText = 'max-width:90%;max-height:90%;border-radius:8px;';

  modal.appendChild(img);
  modal.addEventListener('click', () => modal.remove());
  document.body.appendChild(modal);
}

function showError(containerId, message) {
  const container = document.getElementById(containerId);
  container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">${message}</div></div>`;
}

// ========================================
// Event Listeners
// ========================================

document.addEventListener('DOMContentLoaded', () => {
  console.log('Dashboard loaded, connecting to server...');

  setupTabs();
  connectSSE();

  // Compare mode toggle
  document.getElementById('compare-mode').addEventListener('change', () => {
    renderScreenshots();
  });

  // Clear feed button
  document.getElementById('clear-feed').addEventListener('click', () => {
    state.feedItems = [];
    renderFeed();
    addFeedItem('info', 'Feed cleared');
  });

  // Auto-refresh every 30 seconds as fallback
  setInterval(() => {
    if (state.connected) {
      loadState();
    }
  }, 30000);
});
