#!/bin/bash
# start-team.sh — Avvia il team punto! in una sessione tmux
# Uso: bash agents/scripts/start-team.sh [--safe | --trusted]

SESSION="punto"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

# ─── Scelta modalità ─────────────────────────────────────────
if [[ "$1" == "--safe" ]]; then
  MODE="safe"
elif [[ "$1" == "--trusted" ]]; then
  MODE="trusted"
else
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  punto! — Avvio team multi-agent"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "  [1] SAFE     — ogni operazione richiede conferma"
  echo "  [2] TRUSTED  — autonomia completa, nessuna conferma"
  echo ""
  if [ -t 0 ]; then
    read -rp "  Scelta [1/2]: " choice
    echo ""
    case "$choice" in
      2) MODE="trusted" ;;
      *) MODE="safe" ;;
    esac
  else
    MODE="safe"
    echo "  (nessun terminale interattivo — modalità SAFE di default)"
    echo "  Usa: bash agents/scripts/start-team.sh --trusted  per modalità trusted"
    echo ""
  fi
fi

if [[ "$MODE" == "trusted" ]]; then
  AGENT_CMD="claude --dangerously-skip-permissions"
  echo "  ⚡ Modalità: TRUSTED"
else
  AGENT_CMD="claude"
  echo "  🛡️  Modalità: SAFE"
fi
echo ""

# ─── Verifica tmux ───────────────────────────────────────────
if ! command -v tmux &>/dev/null; then
  echo "❌ tmux non trovato. Installa con: brew install tmux"
  exit 1
fi

# ─── Termina sessione esistente ───────────────────────────────
tmux kill-session -t "$SESSION" 2>/dev/null

# ─── Crea finestre (ogni agente nella propria subdir → CLAUDE.md auto-caricato) ──
tmux new-session -d -s "$SESSION" -n "lead"   -c "$ROOT/agents/team-lead" || { echo "❌ Errore tmux. ROOT=$ROOT"; exit 1; }
tmux new-window  -t "$SESSION"   -n "alpha"   -c "$ROOT/agents/alpha"
tmux new-window  -t "$SESSION"   -n "beta"    -c "$ROOT/agents/beta"
tmux new-window  -t "$SESSION"   -n "w-lead"  -c "$ROOT"
tmux new-window  -t "$SESSION"   -n "w-alpha" -c "$ROOT"
tmux new-window  -t "$SESSION"   -n "w-beta"  -c "$ROOT"

# ─── Avvia watcher ───────────────────────────────────────────
tmux send-keys -t "$SESSION:w-lead"  "node agents/scripts/watch-lead.js"        Enter
tmux send-keys -t "$SESSION:w-alpha" "node agents/scripts/watch-agent.js alpha" Enter
tmux send-keys -t "$SESSION:w-beta"  "node agents/scripts/watch-agent.js beta"  Enter

# ─── Avvia Claude (CLAUDE.md caricato nativamente dalla subdir) ──
sleep 1
tmux send-keys -t "$SESSION:lead"  "claude" Enter
tmux send-keys -t "$SESSION:alpha" "$AGENT_CMD --model claude-sonnet-4-6" Enter
tmux send-keys -t "$SESSION:beta"  "$AGENT_CMD --model claude-haiku-4-5-20251001" Enter

# ─── Imposta modello lead (opusplan) ─────────────────────────
sleep 5
tmux send-keys -t "$SESSION:lead" "/model opusplan" Enter

# ─── In trusted: conferma prompt sicurezza ────────────────────
if [[ "$MODE" == "trusted" ]]; then
  tmux send-keys -t "$SESSION:alpha" "yes" Enter
  tmux send-keys -t "$SESSION:beta"  "yes" Enter
fi

# ─── Focus lead ──────────────────────────────────────────────
tmux select-window -t "$SESSION:lead"

# ─── Istruzioni ──────────────────────────────────────────────
echo "✅ Team '$SESSION' avviato in modalità $(echo $MODE | tr a-z A-Z)"
echo ""
echo "  Apri Terminal.app ed esegui:"
echo "    tmux attach -t $SESSION"
echo ""
echo "  Navigazione (Ctrl+B non funziona in VS Code):"
echo "    Ctrl+B + 0  → lead     Ctrl+B + 3  → w-lead"
echo "    Ctrl+B + 1  → alpha    Ctrl+B + 4  → w-alpha"
echo "    Ctrl+B + 2  → beta     Ctrl+B + 5  → w-beta"
echo "    Ctrl+B + W  → lista    Ctrl+B + D  → esci"
echo ""
echo "  Modelli: lead=opusplan | alpha=sonnet | beta=haiku"
echo ""
if [[ "$MODE" == "safe" ]]; then
  echo "  🛡️  SAFE: approva le operazioni in ogni finestra agente."
else
  echo "  ⚡ TRUSTED: agenti autonomi. Monitora w-lead per notifiche."
fi
echo ""
echo "  Aggancio automatico al Team Lead tra 2 secondi..."
sleep 2
tmux attach -t "$SESSION:lead"
