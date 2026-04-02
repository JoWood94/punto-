#!/usr/bin/env node
/**
 * send-task.js — Invia un task a un agente dal Team Lead
 *
 * Se l'inbox dell'agente è occupata (task in_progress), accoda automaticamente.
 * watch-lead.js dispatcha il prossimo task dalla coda quando il corrente è done.
 *
 * Uso: node agents/scripts/send-task.js <agent> "<testo del task>"
 * Oppure con file: node agents/scripts/send-task.js <agent> --file <path>
 *
 * Esempi:
 *   node agents/scripts/send-task.js alpha "Rimuovi i TODO sull'upload immagini"
 *   node agents/scripts/send-task.js beta --file agents/state/B-1-cors-storage.md
 */

const fs   = require('fs');
const path = require('path');

const ROOT      = path.resolve(__dirname, '../..');
const INBOX     = path.join(ROOT, 'agents/inbox');
const STATE_DIR = path.join(ROOT, 'agents/state');
const QUEUE_DIR = path.join(ROOT, 'agents/queue');

const agent = process.argv[2];
const flag  = process.argv[3];
const value = process.argv[4];

if (!agent) {
  console.error('Uso: node send-task.js <agent> "<task>" oppure <agent> --file <path>');
  process.exit(1);
}

let taskContent;

if (flag === '--file') {
  const filePath = path.resolve(ROOT, value);
  if (!fs.existsSync(filePath)) {
    console.error(`File non trovato: ${filePath}`);
    process.exit(1);
  }
  taskContent = fs.readFileSync(filePath, 'utf8');
} else {
  taskContent = flag || '';
  if (!taskContent) {
    console.error('Specifica il testo del task o usa --file <path>');
    process.exit(1);
  }
}

// Determina il task-id
let taskId;
if (flag === '--file') {
  const filePath = path.resolve(ROOT, value);
  const stateDir = path.resolve(STATE_DIR);
  if (filePath.startsWith(stateDir + path.sep)) {
    taskId = path.basename(filePath, '.md');
  }
}
if (!taskId) {
  const rand = Math.random().toString(36).slice(2, 6);
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  taskId = `task-${date}-${rand}`;
}

// Controlla se l'inbox è occupata (task corrente ancora in_progress)
function isInboxBusy() {
  const inboxFile = path.join(INBOX, `${agent}.md`);
  if (!fs.existsSync(inboxFile)) return false;
  const content = fs.readFileSync(inboxFile, 'utf8');
  const match = content.match(/task-id:\s*(\S+)/);
  if (!match) return false;
  const currentTaskId = match[1];
  const stateFile = path.join(STATE_DIR, `${currentTaskId}.md`);
  if (!fs.existsSync(stateFile)) return false;
  const stateContent = fs.readFileSync(stateFile, 'utf8');
  return stateContent.includes('status: in_progress') || stateContent.includes('status: todo');
}

// Scrive direttamente nell'inbox
function dispatchToInbox(tId, content) {
  if (!fs.existsSync(INBOX)) fs.mkdirSync(INBOX, { recursive: true });
  const inboxFile = path.join(INBOX, `${agent}.md`);
  const ts = new Date().toISOString();
  fs.writeFileSync(inboxFile,
    `<!-- task inviato: ${ts} | task-id: ${tId} -->\n` +
    `task-id: ${tId}\n` +
    `state-file: agents/state/${tId}.md\n\n` +
    `${content}\n`
  );
}

// Aggiunge alla coda
function enqueue(tId, content) {
  if (!fs.existsSync(QUEUE_DIR)) fs.mkdirSync(QUEUE_DIR, { recursive: true });
  const queueFile = path.join(QUEUE_DIR, `${agent}.json`);
  const queue = fs.existsSync(queueFile)
    ? JSON.parse(fs.readFileSync(queueFile, 'utf8'))
    : [];
  // Evita duplicati
  if (queue.some(item => item.taskId === tId)) {
    console.log(`[LEAD → ${agent.toUpperCase()}] Task già in coda: ${tId}`);
    return;
  }
  queue.push({ taskId: tId, content, queuedAt: new Date().toISOString() });
  fs.writeFileSync(queueFile, JSON.stringify(queue, null, 2));
}

if (isInboxBusy()) {
  enqueue(taskId, taskContent);
  const queueFile = path.join(QUEUE_DIR, `${agent}.json`);
  const queue = JSON.parse(fs.readFileSync(queueFile, 'utf8'));
  console.log(`[LEAD → ${agent.toUpperCase()}] Inbox occupata — accodato (posizione ${queue.length}): ${taskId}`);
  console.log(`Track: agents/state/${taskId}.md`);
} else {
  dispatchToInbox(taskId, taskContent);
  console.log(`[LEAD → ${agent.toUpperCase()}] Task inviato → agents/inbox/${agent}.md`);
  console.log(`Track: agents/state/${taskId}.md`);
}
