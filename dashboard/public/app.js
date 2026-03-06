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
  overview: {
    status: 'Idle',
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
  claudeProgress: {
    exists: false,
    lineCount: 0,
    sessionCount: 0,
    currentSession: null,
    activeSubplan: null,
    todos: {
      total: 0,
      pending: 0,
      inProgress: 0,
      completed: 0,
      cancelled: 0,
      items: []
    },
    completedSubplans: [],
    commitCount: 0,
    recentCommits: [],
    latestResult: null,
    recentActivity: [],
    literalLines: [],
    auditTrail: [],
    eventCounts: {
      assistant: 0,
      user: 0,
      system: 0,
      result: 0,
      other: 0
    },
    parseErrors: 0
  },
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

  eventSource.addEventListener('claude-progress', (e) => {
    const data = JSON.parse(e.data);
    console.log('Claude progress updated:', data);
    state.claudeProgress = data;
    syncOverviewFromClaudeProgress();
    updateOverview();
    if (isTabActive('migration-progress')) {
      renderClaudeProgress();
    }
    addFeedItem('info', `Claude progress updated${data.activeSubplan ? `: ${data.activeSubplan}` : ''}`);
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
    loadClaudeProgress(),
    loadScreenshots(),
    loadInterventions()
  ]);
}

async function loadState() {
  try {
    const response = await fetch('/api/state');
    const data = await response.json();

    state.session = data.session;
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
    syncOverviewFromClaudeProgress();
    updateOverview();
    renderMicroPlans();
  } catch (error) {
    console.error('Failed to load micro-plans:', error);
    showError('micro-plans-list', 'Failed to load micro-plans');
  }
}

async function loadClaudeProgress() {
  try {
    const response = await fetch('/api/claude-progress');
    const data = await response.json();
    state.claudeProgress = data;
    syncOverviewFromClaudeProgress();
    updateOverview();
    renderClaudeProgress();
  } catch (error) {
    console.error('Failed to load Claude progress:', error);
    showError('migration-progress-content', 'Failed to load Claude progress');
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

async function loadInterventions() {
  try {
    const response = await fetch('/api/interventions');
    const data = await response.json();
    state.interventions = data;
    syncOverviewFromClaudeProgress();
    updateOverview();
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
  document.getElementById('overall-status').textContent = state.overview.status;

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
  if (state.overview.modified) {
    lastUpdatedEl.textContent = formatRelativeTime(new Date(state.overview.modified));
  } else {
    lastUpdatedEl.textContent = '—';
  }

  // Progress
  const completed = state.overview.completed || 0;
  const total = state.overview.total || 0;
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

  // Group screenshots by type and feature/subplan (source + target pairs)
  // Screenshots are sorted most-recent-first, so we keep only the first (newest) for each group
  const groups = {};

  state.screenshots.forEach(screenshot => {
    if (screenshot.type === 'baseline') {
      // Group baselines by feature number (baseline-01, baseline-02, etc.)
      const key = `baseline-${screenshot.featureNum}`;
      groups[key] = groups[key] || {};
      // Only set if not already set (keep the most recent)
      if (!groups[key][screenshot.variant]) {
        groups[key][screenshot.variant] = screenshot;
      }
    } else if (screenshot.type === 'iteration' || screenshot.type === 'analysis') {
      const key = `${screenshot.featureNum}-${screenshot.subplanNum}`;
      groups[key] = groups[key] || {};
      // Only set if not already set (keep the most recent)
      if (!groups[key][screenshot.variant]) {
        groups[key][screenshot.variant] = screenshot;
      }
    }
  });

  const html = Object.entries(groups)
    .sort((a, b) => {
      // Sort by feature/subplan number (descending for most recent first)
      // Baselines go at the end
      const aIsBaseline = a[0].startsWith('baseline-');
      const bIsBaseline = b[0].startsWith('baseline-');
      if (aIsBaseline && !bIsBaseline) return 1;
      if (!aIsBaseline && bIsBaseline) return -1;
      return b[0].localeCompare(a[0]);
    })
    .map(([key, screenshots]) => {
      const firstScreenshot = screenshots.source || screenshots.target;
      const isBaseline = key.startsWith('baseline-');
      const isAnalysis = firstScreenshot?.type === 'analysis';

      let title;
      if (isBaseline) {
        const featureNum = key.replace('baseline-', '');
        title = `Baseline Feature ${featureNum}`;
      } else if (isAnalysis) {
        title = `Analysis ${key}`;
      } else {
        title = `Subplan ${key}`;
      }
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

function renderClaudeProgress() {
  const container = document.getElementById('migration-progress-content');
  const progress = state.claudeProgress;
  const auditTrailItems = Array.isArray(progress.auditTrail) ? progress.auditTrail : [];
  const recentActivityItems = Array.isArray(progress.recentActivity) ? progress.recentActivity : [];

  if (!progress.exists) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🧠</div><div class="empty-state-text">No `claude-output.jsonl` file found</div></div>';
    return;
  }

  const lastUpdated = progress.lastUpdated ? formatRelativeTime(new Date(progress.lastUpdated)) : 'Unknown';
  const activeSubplan = progress.activeSubplan || 'No active subplan detected';
  const latestResult = progress.latestResult ? `
    <div class="migration-progress-section">
      <div class="migration-progress-section-title">Latest Run Result</div>
      <div class="migration-progress-result ${progress.latestResult.isError ? 'error' : 'success'}">
        <div class="migration-progress-result-title">
          ${progress.latestResult.isError ? 'Failed' : 'Completed'}${progress.latestResult.subtype ? ` • ${progress.latestResult.subtype}` : ''}
        </div>
        <div class="migration-progress-result-meta">
          ${progress.latestResult.durationMs ? formatDuration(progress.latestResult.durationMs) : 'Unknown duration'}
          ${progress.latestResult.numTurns ? ` • ${progress.latestResult.numTurns} turns` : ''}
        </div>
        <div class="migration-progress-result-summary">${escapeHtml(progress.latestResult.summary || 'No summary available')}</div>
      </div>
    </div>
  ` : '';

  const todoItems = progress.todos.items.map(todo => `
    <div class="migration-progress-todo-item">
      <span class="migration-progress-todo-status ${todo.status}">${formatTodoStatus(todo.status)}</span>
      <span>${escapeHtml(todo.content)}</span>
    </div>
  `).join('');

  const recentCommits = progress.recentCommits.length > 0
    ? progress.recentCommits.map(commit => `
      <div class="migration-progress-list-item">
        <div class="migration-progress-list-title">${escapeHtml(commit.subplan)}</div>
        <div class="migration-progress-list-meta">${escapeHtml(commit.sha)}</div>
        <div class="migration-progress-list-body">${escapeHtml(commit.message)}</div>
      </div>
    `).join('')
    : '<div class="empty-state compact"><div class="empty-state-text">No subplan commits detected yet</div></div>';

  const parsedTimeline = auditTrailItems.length > 0
    ? auditTrailItems.map(item => renderParsedTimelineItem(item)).join('')
    : recentActivityItems.length > 0
      ? recentActivityItems.map(item => {
        if (item.kind === 'literal') {
          return `
            <div class="migration-progress-list-item migration-progress-list-item-plain">
              <div class="migration-progress-list-body migration-progress-literal">${escapeHtml(item.detail)}</div>
            </div>
          `;
        }

        return `
          <div class="migration-progress-list-item">
            <div class="migration-progress-list-title">${escapeHtml(item.label)}</div>
            <div class="migration-progress-list-meta">Line ${item.line}${item.sessionId ? ` • Session ${escapeHtml(item.sessionId.slice(0, 8))}...` : ''}</div>
            <div class="migration-progress-list-body">${escapeHtml(item.detail)}</div>
          </div>
        `;
      }).join('')
      : '<div class="empty-state compact"><div class="empty-state-text">No parsed activity available yet</div></div>';

  const auditTrail = auditTrailItems.length > 0
    ? auditTrailItems.map(item => `
      <div class="migration-progress-audit-row">
        <div class="migration-progress-audit-meta">
          <span class="migration-progress-audit-line">L${item.line}</span>
          <span class="migration-progress-audit-kind ${item.kind}">${escapeHtml(formatAuditKind(item.kind, item.eventType))}</span>
          ${item.sessionId ? `<span class="migration-progress-audit-session">${escapeHtml(item.sessionId.slice(0, 8))}...</span>` : ''}
        </div>
        <div class="migration-progress-list-body migration-progress-literal">${escapeHtml(item.text)}</div>
      </div>
    `).join('')
    : '<div class="empty-state compact"><div class="empty-state-text">No audit lines found</div></div>';

  container.innerHTML = `
    <div class="migration-progress-summary-grid">
      <div class="migration-progress-stat">
        <div class="migration-progress-stat-label">Active Subplan</div>
        <div class="migration-progress-stat-value">${escapeHtml(activeSubplan)}</div>
      </div>
      <div class="migration-progress-stat">
        <div class="migration-progress-stat-label">JSONL Lines</div>
        <div class="migration-progress-stat-value">${progress.lineCount}</div>
      </div>
      <div class="migration-progress-stat">
        <div class="migration-progress-stat-label">Sessions</div>
        <div class="migration-progress-stat-value">${progress.sessionCount}</div>
      </div>
      <div class="migration-progress-stat">
        <div class="migration-progress-stat-label">Last Updated</div>
        <div class="migration-progress-stat-value">${lastUpdated}</div>
      </div>
    </div>

    <div class="migration-progress-section">
      <div class="migration-progress-section-title">Task Status</div>
      <div class="migration-progress-task-summary">
        <span>${progress.todos.inProgress} in progress</span>
        <span>${progress.todos.completed} completed</span>
        <span>${progress.todos.pending} pending</span>
        <span>${progress.todos.cancelled} cancelled</span>
      </div>
      <div class="migration-progress-todos">
        ${todoItems || '<div class="empty-state compact"><div class="empty-state-text">No TodoWrite state found yet</div></div>'}
      </div>
    </div>

    <div class="migration-progress-section">
      <div class="migration-progress-section-title">Event Mix</div>
      <div class="migration-progress-task-summary">
        <span>${progress.eventCounts.assistant} assistant</span>
        <span>${progress.eventCounts.user} user</span>
        <span>${progress.eventCounts.system} system</span>
        <span>${progress.eventCounts.result} result</span>
        <span>${progress.parseErrors} parse errors</span>
      </div>
    </div>

    ${latestResult}

    <div class="migration-progress-section">
      <div class="migration-progress-section-title">Recent Subplan Commits</div>
      <div class="migration-progress-list">${recentCommits}</div>
    </div>

    <div class="migration-progress-section">
      <div class="migration-progress-section-title">Parsed Output</div>
      <div class="migration-progress-task-summary">
        <span>${auditTrailItems.length > 0 ? auditTrailItems.length : recentActivityItems.length} entries shown</span>
        ${auditTrailItems.length === 0 ? '<span>Restart the dashboard server to parse the full audit trail</span>' : ''}
      </div>
      <div class="migration-progress-parsed-trail">${parsedTimeline}</div>
    </div>

    <div class="migration-progress-section">
      <div class="migration-progress-section-title">Full Audit Trail</div>
      <div class="migration-progress-task-summary">
        <span>${auditTrailItems.length} lines shown</span>
        ${auditTrailItems.length === 0 ? '<span>Restart the dashboard server to load the full backend audit payload</span>' : ''}
      </div>
      <div class="migration-progress-audit-trail">${auditTrail}</div>
    </div>
  `;
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

  // Activate tab based on URL path
  const activateTab = (tabName, updateUrl = true) => {
    if (tabName === 'log') {
      tabName = 'migration-progress';
    }

    // Update active tab
    tabs.forEach(t => t.classList.remove('tab-active'));
    const activeTab = document.querySelector(`.tab[data-tab="${tabName}"]`);
    if (activeTab) {
      activeTab.classList.add('tab-active');
    }

    // Update active content
    contents.forEach(c => c.classList.remove('tab-content-active'));
    const activeContent = document.getElementById(`tab-${tabName}`);
    if (activeContent) {
      activeContent.classList.add('tab-content-active');
    }

    // Update URL without reload
    if (updateUrl) {
      const newUrl = `/${tabName}`;
      history.pushState({ tab: tabName }, '', newUrl);
    }

    // Load data if needed
    if (tabName === 'migration-progress') {
      loadClaudeProgress();
    }
  };

  // Get initial tab from URL path
  const getTabFromUrl = () => {
    const path = window.location.pathname.replace(/^\/|\/$/g, '');
    if (path === 'log') {
      return 'migration-progress';
    }

    const validTabs = ['micro-plans', 'migration-progress', 'screenshots', 'interventions'];
    return validTabs.includes(path) ? path : 'micro-plans';
  };

  // Set initial tab from URL
  activateTab(getTabFromUrl(), false);

  // Handle browser back/forward navigation
  window.addEventListener('popstate', (event) => {
    const tabName = event.state?.tab || getTabFromUrl();
    activateTab(tabName, false);
  });

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      activateTab(tabName, true);
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
  const subplanId = `subplan-${String(featureNum).padStart(2, '0')}-${String(subplanNum).padStart(2, '0')}`;
  const completedSubplans = new Set(state.claudeProgress.completedSubplans || []);

  if (completedSubplans.has(subplanId)) {
    return 'completed';
  } else if (state.claudeProgress.activeSubplan === subplanId) {
    return 'in-progress';
  } else {
    return 'pending';
  }
}

function syncOverviewFromClaudeProgress() {
  const total = state.microPlans.length;
  const completed = Math.min((state.claudeProgress.completedSubplans || []).length, total);
  const hasPendingInterventions = (state.interventions.needed || []).length > 0;

  let status = 'Idle';
  if (!state.claudeProgress.exists) {
    status = 'Idle';
  } else if (hasPendingInterventions) {
    status = 'Needs Intervention';
  } else if (state.claudeProgress.latestResult?.isError) {
    status = 'Failed';
  } else if (total > 0 && completed >= total) {
    status = 'Completed';
  } else if (state.claudeProgress.activeSubplan) {
    status = 'In Progress';
  } else {
    status = 'Active';
  }

  state.overview = {
    status,
    completed,
    total,
    modified: state.claudeProgress.lastUpdated || null
  };
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

function formatDuration(durationMs) {
  const seconds = Math.round(durationMs / 1000);
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function formatTodoStatus(status) {
  if (status === 'in_progress') return 'In Progress';
  if (status === 'completed') return 'Completed';
  if (status === 'cancelled') return 'Cancelled';
  return 'Pending';
}

function formatAuditKind(kind, eventType) {
  if (kind === 'json') {
    return eventType ? `json:${eventType}` : 'json';
  }

  if (kind === 'invalid-json') {
    return 'invalid-json';
  }

  return 'literal';
}

function renderParsedTimelineItem(item) {
  const parsed = parseAuditTrailItem(item);
  if (parsed.plain) {
    return `
      <div class="migration-progress-list-item migration-progress-list-item-plain">
        <div class="migration-progress-list-body migration-progress-literal">${escapeHtml(parsed.detail)}</div>
      </div>
    `;
  }

  return `
    <div class="migration-progress-list-item migration-progress-parsed-item">
      <div class="migration-progress-list-title">${escapeHtml(parsed.label)}</div>
      <div class="migration-progress-list-meta">${escapeHtml(parsed.meta)}</div>
      <div class="migration-progress-list-body ${parsed.monospace ? 'migration-progress-literal' : ''}">${escapeHtml(parsed.detail)}</div>
    </div>
  `;
}

function parseAuditTrailItem(item) {
  if (item.kind === 'literal') {
    return parseLiteralAuditItem(item);
  }

  if (item.kind === 'invalid-json') {
    return {
      label: 'Invalid JSON',
      meta: buildParsedMeta(item.line, item.sessionId),
      detail: item.text,
      monospace: true
    };
  }

  try {
    const entry = JSON.parse(item.text);
    return parseJsonAuditItem(item, entry);
  } catch (error) {
    return {
      label: 'JSON Parse Error',
      meta: buildParsedMeta(item.line, item.sessionId),
      detail: item.text,
      monospace: true
    };
  }
}

function parseLiteralAuditItem(item) {
  const trimmed = item.text.trim();
  const sessionMatch = trimmed.match(/^Session:\s+([a-f0-9-]+)\s+\|\s+Feature:\s+(.+)$/i);
  if (sessionMatch) {
    return {
      label: 'Session Start',
      meta: buildParsedMeta(item.line, sessionMatch[1]),
      detail: `Feature: ${sessionMatch[2]}\nSession ID: ${sessionMatch[1]}`
    };
  }

  const startedMatch = trimmed.match(/^Started:\s+(.+)$/i);
  if (startedMatch) {
    return {
      label: 'Session Timestamp',
      meta: buildParsedMeta(item.line, item.sessionId),
      detail: startedMatch[1]
    };
  }

  const exitMatch = trimmed.match(/^Exited with code:\s+(.+)$/i);
  if (exitMatch) {
    return {
      label: 'Process Exit',
      meta: buildParsedMeta(item.line, item.sessionId),
      detail: `Exit code: ${exitMatch[1]}`
    };
  }

  if (/^=+$/.test(trimmed)) {
    return {
      plain: true,
      detail: trimmed
    };
  }

  return {
    label: 'Literal Output',
    meta: buildParsedMeta(item.line, item.sessionId),
    detail: item.text,
    monospace: true
  };
}

function parseJsonAuditItem(item, entry) {
  if (entry.type === 'system') {
    return {
      label: `System: ${entry.subtype || 'event'}`,
      meta: buildParsedMeta(item.line, entry.session_id || item.sessionId),
      detail: describeSystemEntry(entry)
    };
  }

  if (entry.type === 'assistant') {
    return {
      label: 'Assistant',
      meta: buildParsedMeta(item.line, entry.session_id || item.sessionId),
      detail: describeMessageContent(entry.message?.content)
    };
  }

  if (entry.type === 'user') {
    return {
      label: 'User / Tool Result',
      meta: buildParsedMeta(item.line, entry.session_id || item.sessionId),
      detail: describeUserEntry(entry)
    };
  }

  if (entry.type === 'result') {
    return {
      label: `Run Result: ${entry.subtype || 'result'}`,
      meta: buildParsedMeta(item.line, entry.session_id || item.sessionId),
      detail: describeResultEntry(entry)
    };
  }

  return {
    label: `JSON Event: ${entry.type || 'unknown'}`,
    meta: buildParsedMeta(item.line, entry.session_id || item.sessionId),
    detail: JSON.stringify(entry, null, 2),
    monospace: true
  };
}

function describeSystemEntry(entry) {
  if (entry.subtype === 'init') {
    const parts = [
      entry.cwd ? `Working directory: ${entry.cwd}` : '',
      entry.model ? `Model: ${entry.model}` : '',
      entry.permissionMode ? `Permissions: ${entry.permissionMode}` : '',
      Array.isArray(entry.mcp_servers) ? `MCP servers: ${entry.mcp_servers.map(server => `${server.name} (${server.status})`).join(', ')}` : '',
      Array.isArray(entry.tools) ? `Tools: ${entry.tools.join(', ')}` : ''
    ].filter(Boolean);

    return parts.join('\n\n');
  }

  if (entry.subtype === 'hook_started') {
    return [
      entry.hook_name ? `Hook: ${entry.hook_name}` : '',
      entry.hook_event ? `Event: ${entry.hook_event}` : '',
      entry.hook_id ? `Hook ID: ${entry.hook_id}` : ''
    ].filter(Boolean).join('\n');
  }

  if (entry.subtype === 'hook_response') {
    return [
      entry.hook_name ? `Hook: ${entry.hook_name}` : '',
      entry.outcome ? `Outcome: ${entry.outcome}` : '',
      entry.exit_code !== undefined ? `Exit code: ${entry.exit_code}` : '',
      entry.output || entry.stdout || entry.stderr || ''
    ].filter(Boolean).join('\n\n');
  }

  return JSON.stringify(entry, null, 2);
}

function describeMessageContent(content) {
  if (!Array.isArray(content) || content.length === 0) {
    return 'No message content';
  }

  return content.map(block => {
    if (block.type === 'text') {
      return block.text || '';
    }

    if (block.type === 'thinking') {
      return `Thinking\n\n${block.thinking || ''}`;
    }

    if (block.type === 'tool_use') {
      const input = block.input ? JSON.stringify(block.input, null, 2) : '{}';
      return `Tool Use: ${block.name || 'unknown'}\n\n${input}`;
    }

    return JSON.stringify(block, null, 2);
  }).filter(Boolean).join('\n\n---\n\n');
}

function describeUserEntry(entry) {
  const parts = [];
  const content = entry.message?.content;

  if (Array.isArray(content)) {
    content.forEach(item => {
      if (typeof item?.text === 'string') {
        parts.push(item.text);
      } else if (typeof item?.content === 'string') {
        parts.push(item.content);
      } else if (Array.isArray(item?.content)) {
        const toolRefs = item.content
          .filter(contentItem => contentItem?.tool_name)
          .map(contentItem => contentItem.tool_name);
        if (toolRefs.length > 0) {
          parts.push(`Tool references: ${toolRefs.join(', ')}`);
        }
      }
    });
  }

  if (typeof entry.tool_use_result === 'string') {
    parts.push(entry.tool_use_result);
  } else if (entry.tool_use_result?.stdout) {
    parts.push(entry.tool_use_result.stdout);
  } else if (entry.tool_use_result && typeof entry.tool_use_result === 'object') {
    parts.push(JSON.stringify(entry.tool_use_result, null, 2));
  }

  return parts.filter(Boolean).join('\n\n') || 'No user/tool result text';
}

function describeResultEntry(entry) {
  const parts = [];

  if (entry.is_error !== undefined) {
    parts.push(`Error: ${entry.is_error ? 'yes' : 'no'}`);
  }
  if (entry.duration_ms !== undefined) {
    parts.push(`Duration: ${formatDuration(entry.duration_ms)}`);
  }
  if (entry.num_turns !== undefined) {
    parts.push(`Turns: ${entry.num_turns}`);
  }
  if (entry.result) {
    parts.push(entry.result);
  }

  return parts.join('\n\n');
}

function buildParsedMeta(line, sessionId) {
  return `Line ${line}${sessionId ? ` • Session ${sessionId.slice(0, 8)}...` : ''}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

  // Auto-refresh key dashboard state every 30 seconds as fallback.
  setInterval(() => {
    if (state.connected) {
      loadState();
      loadClaudeProgress();
      loadInterventions();
    }
  }, 30000);
});
