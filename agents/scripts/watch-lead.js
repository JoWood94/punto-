#!/usr/bin/env node
/**
 * watch-lead.js — Watcher per il Team Lead
 * - agents/inbox/*.response.md → stato iniezione prompt
 * - agents/state/*.md          → completamento reale dei task
 * - Timeout detection          → avvisa se agente non risponde in >10 min
 */

const fs            = require('fs');
const path          = require('path');
const { execSync }  = require('child_process');

const SESSION = 'punto';

const ROOT      = path.resolve(__dirname, '../..');
const INBOX     = path.join(ROOT, 'agents/inbox');
const STATE     = path.join(ROOT, 'agents/state');
const QUEUE_DIR = path.join(ROOT, 'agents/queue');

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] [LEAD] ${msg}`);
}

function notifyLead(msg) {
  try {
    execSync(`tmux send-keys -t ${SESSION}:lead ${JSON.stringify('[w-lead] ' + msg)} Enter`);
  } catch (_) { /* lead pane potrebbe non esistere */ }
}

const seenMtimes = {};

function checkDir(dir, fileFilter, handler) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir).filter(fileFilter);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const mtime = String(fs.statSync(fullPath).mtimeMs);
    const key = path.join(dir, file);
    if (seenMtimes[key] === mtime) continue;
    seenMtimes[key] = mtime;
    const content = fs.readFileSync(fullPath, 'utf8');
    handler(file, content);
  }
}

function checkInbox() {
  checkDir(INBOX, f => f.endsWith('.response.md'), (file, content) => {
    const statusLine = content.split('\n')[0];
    const agentName = file.replace('.response.md', '').toUpperCase();
    if (statusLine.includes('in_progress')) {
      log(`⏳ ${agentName} sta lavorando...`);
    } else if (statusLine.includes('error')) {
      log(`❌ ${agentName} errore — leggi agents/inbox/${file}`);
    }
  });
}

function checkState() {
  checkDir(STATE, f => f.endsWith('.md'), (file, content) => {
    const lines = content.split('\n');
    const statusLine = lines.find(l => l.startsWith('status:')) || '';
    const agentLine  = lines.find(l => l.startsWith('agent:')) || '';
    const taskLine   = lines.find(l => l.startsWith('task:')) || '';
    const agent = agentLine.replace('agent:', '').trim().toUpperCase();
    const task  = taskLine.replace('task:', '').trim();

    if (statusLine.includes('done')) {
      log(`✅ ${agent} — DONE: ${file}`);
      if (task) log(`   "${task}"`);
      notifyLead(`✅ ${agent} — DONE: ${file}. Leggi agents/state/${file}`);
      dispatchNextFromQueue(agentLine);
    } else if (statusLine.includes('cancelled')) {
      log(`🚫 ${agent} — CANCELLED: ${file}`);
      notifyLead(`🚫 ${agent} — CANCELLED: ${file}`);
    } else if (statusLine.includes('blocked')) {
      const blockedLine = lines.find(l => l.startsWith('bloccato_da:') || l.startsWith('blocked_by:')) || '';
      const reason = blockedLine.replace(/^(bloccato_da|blocked_by):/, '').trim();
      log(`🔴 ${agent} — BLOCKED: ${file} — ${reason}`);
      notifyLead(`🔴 ${agent} — BLOCKED: ${reason}. Leggi agents/state/${file}`);
    } else if (statusLine.includes('in_progress')) {
      log(`⏳ ${agent} — in progress: ${file}`);
    }
  });
}

// ─── Timeout detection ────────────────────────────────────────
// Avvisa se un agente ha ricevuto un task ma non ha aggiornato lo stato in >10 min
function checkTimeouts() {
  if (!fs.existsSync(INBOX)) return;
  const now = Date.now();
  const TIMEOUT_MS = 10 * 60 * 1000; // 10 minuti

  const inboxFiles = fs.readdirSync(INBOX).filter(f =>
    f.endsWith('.md') && !f.endsWith('.response.md') && !f.endsWith('.seen')
  );

  for (const file of inboxFiles) {
    const agentName = file.replace('.md', '');
    const inboxPath = path.join(INBOX, file);
    const inboxMtime = fs.statSync(inboxPath).mtimeMs;

    if (now - inboxMtime < TIMEOUT_MS) continue; // task recente, ok

    // Cerca lo state file più recente per questo agente con status in_progress
    if (!fs.existsSync(STATE)) continue;
    const stateFiles = fs.readdirSync(STATE).filter(f => f.endsWith('.md'));
    for (const sf of stateFiles) {
      const content = fs.readFileSync(path.join(STATE, sf), 'utf8');
      const agentLine  = (content.split('\n').find(l => l.startsWith('agent:')) || '').replace('agent:', '').trim();
      const statusLine = (content.split('\n').find(l => l.startsWith('status:')) || '');
      const statMtime  = fs.statSync(path.join(STATE, sf)).mtimeMs;

      if (agentLine === agentName && statusLine.includes('in_progress') && now - statMtime > TIMEOUT_MS) {
        const mins = Math.round((now - statMtime) / 60000);
        log(`⚠️  ${agentName.toUpperCase()} — nessun aggiornamento da >${mins} min (${sf})`);
        notifyLead(`⚠️ ${agentName.toUpperCase()} — nessun aggiornamento da >${mins} min (${sf})`);
      }
    }
  }
}

// ─── Queue dispatch ───────────────────────────────────────────
function dispatchNextFromQueue(agentName) {
  if (!agentName) return;
  const queueFile = path.join(QUEUE_DIR, `${agentName}.json`);
  if (!fs.existsSync(queueFile)) return;
  const queue = JSON.parse(fs.readFileSync(queueFile, 'utf8'));
  if (queue.length === 0) return;

  const next = queue.shift();
  fs.writeFileSync(queueFile, JSON.stringify(queue, null, 2));

  const inboxFile = path.join(INBOX, `${agentName}.md`);
  const ts = new Date().toISOString();
  fs.writeFileSync(inboxFile,
    `<!-- task inviato: ${ts} | task-id: ${next.taskId} -->\n` +
    `task-id: ${next.taskId}\n` +
    `state-file: agents/state/${next.taskId}.md\n\n` +
    `${next.content}\n`
  );

  const remaining = queue.length;
  log(`📤 Auto-dispatch → ${agentName.toUpperCase()}: ${next.taskId} (${remaining} in coda)`);
  notifyLead(`📤 ${agentName.toUpperCase()} — nuovo task dalla coda: ${next.taskId}${remaining > 0 ? ` (+${remaining} ancora in coda)` : ''}`);
}

log('Team Lead watcher avviato');
log('Ascolto: agents/inbox/*.response.md + agents/state/*.md');
log('Timeout check ogni 2 minuti.');

checkInbox();
checkState();

fs.watch(INBOX, (_, filename) => {
  if (filename && filename.endsWith('.response.md')) {
    setTimeout(checkInbox, 200);
  }
});

fs.watch(STATE, (_, filename) => {
  if (filename && filename.endsWith('.md')) {
    setTimeout(checkState, 200);
  }
});

// Controlla timeout ogni 2 minuti
setInterval(checkTimeouts, 2 * 60 * 1000);
