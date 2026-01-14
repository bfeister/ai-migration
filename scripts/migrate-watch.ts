#!/usr/bin/env tsx
import { watch } from 'chokidar';
import { readFile, writeFile, rename, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import prompts from 'prompts';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Colors for terminal output
const colors = {
  green: '\x1b[0;32m',
  red: '\x1b[0;31m',
  yellow: '\x1b[1;33m',
  cyan: '\x1b[0;36m',
  nc: '\x1b[0m',
};

interface Intervention {
  id: string;
  timestamp: string;
  question: string;
  options?: string[];
  context?: string;
  worker_id?: string;
  filePath: string;
  fileModTime: number;
}

interface InterventionQueue {
  [id: string]: Intervention;
}

const interventionQueue: InterventionQueue = {};
let isProcessing = false;

// Get the project root directory (one level up from scripts/)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
const interventionDir = join(projectRoot, 'intervention');
const interventionPattern = join(interventionDir, 'needed-*.json');
const historyDir = join(interventionDir, 'history');

function log(message: string, color?: keyof typeof colors) {
  const colorCode = color ? colors[color] : '';
  const resetCode = color ? colors.nc : '';
  console.log(`${colorCode}${message}${resetCode}`);
}

function logBox(message: string, color: keyof typeof colors) {
  const line = '═'.repeat(60);
  log(`╔${line}╗`, color);
  log(`║  ${message.padEnd(58)}║`, color);
  log(`╚${line}╝`, color);
}

async function getFileModTime(filePath: string): Promise<number> {
  try {
    const { stat } = await import('fs/promises');
    const stats = await stat(filePath);
    return stats.mtimeMs;
  } catch {
    return 0;
  }
}

async function loadIntervention(filePath: string): Promise<Intervention | null> {
  try {
    const content = await readFile(filePath, 'utf-8');
    const data = JSON.parse(content);
    const modTime = await getFileModTime(filePath);

    // Generate unique ID from file path (ensures each file gets unique ID)
    const fileName = filePath.split('/').pop() || 'unknown';
    const id = fileName.replace('.json', '');

    return {
      id,
      timestamp: data.timestamp || new Date().toISOString(),
      question: data.question || 'No question specified',
      options: data.options,
      context: data.context,
      worker_id: data.worker_id,
      filePath,
      fileModTime: modTime,
    };
  } catch (error) {
    log(`Error loading intervention: ${error}`, 'red');
    return null;
  }
}

async function sendSystemNotification(title: string, message: string) {
  if (process.platform === 'darwin') {
    try {
      await execAsync(`osascript -e 'display notification "${message}" with title "${title}"'`);
    } catch {
      // Silently fail if osascript is not available
    }
  }
}

async function displayIntervention(intervention: Intervention) {
  console.log('');
  logBox('🔔 USER INTERVENTION NEEDED', 'yellow');
  console.log('');

  log('Question:', 'cyan');
  log(`  ${intervention.question}`);
  console.log('');

  if (intervention.context) {
    log('Context:', 'cyan');
    log(`  ${intervention.context}`);
    console.log('');
  }

  if (intervention.options && intervention.options.length > 0) {
    log('Options:', 'cyan');
    intervention.options.forEach((option, index) => {
      log(`  ${index + 1}. ${option}`);
    });
    console.log('');
  }

  if (intervention.worker_id) {
    log(`Worker ID: ${intervention.worker_id}`, 'cyan');
    console.log('');
  }
}

async function promptForResponse(intervention: Intervention): Promise<string | null> {
  let response: prompts.Answers<string>;

  if (intervention.options && intervention.options.length > 0) {
    // Multiple choice
    response = await prompts({
      type: 'select',
      name: 'answer',
      message: 'Select your response:',
      choices: [
        ...intervention.options.map((option) => ({
          title: option,
          value: option,
        })),
        { title: 'Other (custom text)', value: '__custom__' },
      ],
    });

    if (response.answer === '__custom__') {
      const customResponse = await prompts({
        type: 'text',
        name: 'answer',
        message: 'Enter your custom response:',
      });
      return customResponse.answer || null;
    }

    return response.answer || null;
  } else {
    // Free text
    response = await prompts({
      type: 'text',
      name: 'answer',
      message: 'Enter your response:',
    });

    return response.answer || null;
  }
}

async function saveResponse(intervention: Intervention, answer: string) {
  const responseData = {
    timestamp: new Date().toISOString(),
    response: answer,
    question_timestamp: intervention.timestamp,
    intervention_id: intervention.id,
  };

  // Create response file with same naming pattern as intervention
  const interventionFileName = intervention.filePath.split('/').pop() || 'needed.json';
  const responseFileName = interventionFileName.replace('needed-', 'response-');
  const responseFile = join(interventionDir, responseFileName);

  await writeFile(responseFile, JSON.stringify(responseData, null, 2));
  log(`✅ Response sent: "${answer}"`, 'green');
}

async function archiveIntervention(intervention: Intervention) {
  try {
    // Ensure history directory exists
    if (!existsSync(historyDir)) {
      await mkdir(historyDir, { recursive: true });
    }

    // Wait a bit for the container to process the response
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Archive the intervention file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const interventionFileName = intervention.filePath.split('/').pop() || 'intervention.json';
    const archivePath = join(historyDir, `${timestamp}_${interventionFileName}`);

    if (existsSync(intervention.filePath)) {
      await rename(intervention.filePath, archivePath);
      log('Intervention archived', 'green');
    }

    // Clean up corresponding response file if it exists
    const responseFileName = interventionFileName.replace('needed-', 'response-');
    const responseFile = join(interventionDir, responseFileName);
    if (existsSync(responseFile)) {
      const responseArchivePath = join(historyDir, `${timestamp}_${responseFileName}`);
      await rename(responseFile, responseArchivePath);
    }
  } catch (error) {
    log(`Warning: Could not archive intervention: ${error}`, 'yellow');
  }
}

async function processIntervention(intervention: Intervention) {
  if (isProcessing) {
    return;
  }

  isProcessing = true;

  try {
    await displayIntervention(intervention);
    await sendSystemNotification(
      'Migration Intervention Needed',
      intervention.question
    );

    const answer = await promptForResponse(intervention);

    if (answer) {
      await saveResponse(intervention, answer);
      console.log('');
      log('The migration worker will now continue execution.', 'green');

      // Wait for container to process and remove the file
      log('Waiting for container to process response...', 'cyan');

      // Give the container time to process
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Archive if file still exists
      await archiveIntervention(intervention);

      // Remove from queue
      delete interventionQueue[intervention.id];

      console.log('');
      logBox('✅ Intervention resolved and archived', 'green');
      console.log('');
    } else {
      log('Response cancelled', 'yellow');
    }
  } catch (error) {
    log(`Error processing intervention: ${error}`, 'red');
  } finally {
    isProcessing = false;

    // Check if there are more interventions in the queue
    if (Object.keys(interventionQueue).length > 0) {
      await handleQueue();
    }
  }
}

async function handleQueue() {
  if (isProcessing) {
    return;
  }

  const interventions = Object.values(interventionQueue);

  if (interventions.length === 0) {
    return;
  }

  if (interventions.length === 1) {
    // Single intervention, process it directly
    await processIntervention(interventions[0]);
  } else {
    // Multiple interventions, let user choose
    console.log('');
    log(`Found ${interventions.length} pending interventions`, 'yellow');
    console.log('');

    const choices = interventions.map((intervention) => ({
      title: `[${intervention.worker_id || 'unknown'}] ${intervention.question.substring(0, 60)}...`,
      description: `Timestamp: ${intervention.timestamp}`,
      value: intervention.id,
    }));

    const response = await prompts({
      type: 'select',
      name: 'selectedId',
      message: 'Which intervention would you like to respond to?',
      choices,
    });

    if (response.selectedId) {
      const selected = interventionQueue[response.selectedId];
      if (selected) {
        await processIntervention(selected);
      }
    }
  }
}

async function onInterventionFileChange(filePath: string) {
  // Filter for needed-*.json files only
  const fileName = filePath.split('/').pop() || '';
  if (!fileName.startsWith('needed-') || !fileName.endsWith('.json')) {
    return;
  }

  if (!existsSync(filePath)) {
    return;
  }

  log(`Detected file: ${fileName}`, 'cyan');

  const intervention = await loadIntervention(filePath);

  if (!intervention) {
    return;
  }

  // Check if this is a new or updated intervention
  const existing = interventionQueue[intervention.id];

  if (!existing || existing.fileModTime !== intervention.fileModTime) {
    interventionQueue[intervention.id] = intervention;

    // Process the queue
    await handleQueue();
  }
}

async function startWatcher() {
  log('Monitoring for intervention requests...', 'cyan');
  log('Press Ctrl+C to stop');
  log(`Watching: ${interventionPattern}`, 'cyan');
  console.log('');

  // Ensure intervention directory exists
  if (!existsSync(interventionDir)) {
    await mkdir(interventionDir, { recursive: true });
  }

  // Scan for existing intervention files on startup
  const { readdir } = await import('fs/promises');
  try {
    const files = await readdir(interventionDir);
    const neededFiles = files.filter(f => f.startsWith('needed-') && f.endsWith('.json'));

    if (neededFiles.length > 0) {
      log(`Found ${neededFiles.length} existing intervention file(s)`, 'yellow');
      for (const file of neededFiles) {
        await onInterventionFileChange(join(interventionDir, file));
      }
    }
  } catch (error) {
    log(`Warning: Could not scan for existing files: ${error}`, 'yellow');
  }

  // Watch the intervention directory for all file changes
  const watcher = watch(interventionDir, {
    persistent: true,
    ignoreInitial: true, // We already scanned manually above
    depth: 0, // Don't watch subdirectories
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 50,
    },
  });

  watcher.on('add', (filePath) => {
    log(`File added: ${filePath}`, 'cyan');
    onInterventionFileChange(filePath);
  });

  watcher.on('change', (filePath) => {
    log(`File changed: ${filePath}`, 'cyan');
    onInterventionFileChange(filePath);
  });

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('');
    log('Shutting down intervention monitor...', 'yellow');
    watcher.close();
    process.exit(0);
  });
}

// Start the watcher
startWatcher().catch((error) => {
  log(`Fatal error: ${error}`, 'red');
  process.exit(1);
});
