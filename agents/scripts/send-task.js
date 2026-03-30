#!/usr/bin/env node
/**
 * send-task.js — Invia un task a un agente dal Team Lead
 *
 * Uso: node agents/scripts/send-task.js <agent> "<testo del task>"
 * Oppure con file: node agents/scripts/send-task.js <agent> --file <path>
 *
 * Esempi:
 *   node agents/scripts/send-task.js alpha "Rimuovi i TODO sull'upload immagini in note-editor"
 *   node agents/scripts/send-task.js beta --file agents/state/B-1-cors-storage.md
 */

const fs   = require('fs');
const path = require('path');

const ROOT  = path.resolve(__dirname, '../..');
const INBOX = path.join(ROOT, 'agents/inbox');

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

const inboxFile = path.join(INBOX, `${agent}.md`);
const ts = new Date().toISOString();

fs.writeFileSync(inboxFile, `<!-- task inviato: ${ts} -->\n\n${taskContent}\n`);

console.log(`[LEAD → ${agent.toUpperCase()}] Task inviato → agents/inbox/${agent}.md`);
console.log(`In attesa di risposta in agents/inbox/${agent}.response.md`);
