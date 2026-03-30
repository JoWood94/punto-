#!/usr/bin/env node
/**
 * watch-agent.js — Event-driven bridge per agenti punto!
 *
 * Uso: node agents/scripts/watch-agent.js <agent-name>
 * Esempio: node agents/scripts/watch-agent.js alpha
 *
 * - Guarda agents/inbox/<agent>.md per nuovi task
 * - Quando cambia, lancia `claude -p` con il contenuto
 * - Scrive la risposta in agents/inbox/<agent>.response.md
 * - Segna il task come processato con un timestamp
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

const AGENT = process.argv[2];
if (!AGENT) {
  console.error('Uso: node watch-agent.js <agent-name>');
  process.exit(1);
}

const ROOT = path.resolve(__dirname, '../..');
const INBOX     = path.join(ROOT, 'agents/inbox', `${AGENT}.md`);
const RESPONSE  = path.join(ROOT, 'agents/inbox', `${AGENT}.response.md`);
const SEEN_FILE = path.join(ROOT, 'agents/inbox', `${AGENT}.seen`);

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] [${AGENT.toUpperCase()}] ${msg}`);
}

function getSeenMtime() {
  try { return fs.readFileSync(SEEN_FILE, 'utf8').trim(); } catch { return ''; }
}

function setSeenMtime(mtime) {
  fs.writeFileSync(SEEN_FILE, String(mtime));
}

function getInboxMtime() {
  try { return String(fs.statSync(INBOX).mtimeMs); } catch { return ''; }
}

async function processTask() {
  if (!fs.existsSync(INBOX)) return;

  const currentMtime = getInboxMtime();
  if (currentMtime === getSeenMtime()) return; // già processato

  const task = fs.readFileSync(INBOX, 'utf8').trim();
  if (!task) return;

  setSeenMtime(currentMtime);
  log(`Nuovo task ricevuto — iniezione prompt tmux...`);

  // Scrivi stato "in_progress"
  fs.writeFileSync(RESPONSE, `status: in_progress\ntimestamp: ${new Date().toISOString()}\n`);

  try {
    // Inietta il prompt nella sessione tmux dell'agente (Claude Code interattivo)
    const SESSION = 'punto';
    const notification = `Hai un nuovo task dal Team Lead. Leggi agents/inbox/${AGENT}.md e processalo.`;

    execSync(
      `tmux send-keys -t ${SESSION}:${AGENT} ${JSON.stringify(notification)} Enter`,
      { cwd: ROOT, encoding: 'utf8' }
    );

    fs.writeFileSync(
      RESPONSE,
      `status: in_progress\ntimestamp: ${new Date().toISOString()}\nagent: ${AGENT}\nnote: prompt iniettato nella sessione tmux ${SESSION}:${AGENT}\n`
    );
    log(`Prompt iniettato in tmux sessione ${SESSION}:${AGENT}`);

  } catch (err) {
    fs.writeFileSync(
      RESPONSE,
      `status: error\ntimestamp: ${new Date().toISOString()}\nagent: ${AGENT}\n\n---\n\n${err.message}`
    );
    log(`Errore tmux send-keys: ${err.message}`);
  }
}

// Avvio
log(`Watcher avviato — in ascolto su agents/inbox/${AGENT}.md`);
log(`Premi Ctrl+C per fermare.`);

// Processa subito se c'è già qualcosa
processTask();

// Watch sul file inbox
fs.watch(path.dirname(INBOX), (eventType, filename) => {
  if (filename === path.basename(INBOX)) {
    processTask();
  }
});
