status: done
agent: beta
task: Hook FileChanged in settings.json — notifica Team Lead quando agente completa task
completed: 2026-03-31 - Hook aggiunto a agents/team-lead/.claude/settings.json. Matcher "agents/state", comando extrae status/agent/task e emette JSON con asyncRewake: true (exit code 2) su done|blocked|cancelled. Testato ✅

---

## Obiettivo

Quando un file in `agents/state/*.md` cambia con `status: done`, `blocked`, o `cancelled`,
il Team Lead deve ricevere una notifica nella sua sessione Claude Code attiva (questa conversazione),
senza dover aspettare che Giuseppe scriva qualcosa.

## Meccanismo

Aggiungere un hook `FileChanged` in `agents/team-lead/.claude/settings.json`.

Quando il file cambia:
1. Leggi il file modificato
2. Se `status:` è `done`, `blocked`, o `cancelled` → emetti JSON con `additionalContext`
3. Usa `asyncRewake: true` (exit code 2) per svegliare il modello

## Spec hook

```json
{
  "hooks": {
    "FileChanged": [
      {
        "matcher": "agents/state",
        "hooks": [
          {
            "type": "command",
            "asyncRewake": true,
            "command": "<vedi sotto>"
          }
        ]
      }
    ]
  }
}
```

## Command da costruire

Il comando riceve su stdin un JSON con `file_path`. Deve:
1. Estrarre `file_path` con `jq -r`
2. Leggere `status:`, `agent:`, `task:` dal file
3. Se status è `done`/`blocked`/`cancelled`: stampare JSON con `hookSpecificOutput.additionalContext` e uscire con code 2 (rewake)
4. Altrimenti: uscire con code 0 (silenzioso)

Formato `additionalContext`:
```
[w-lead] ✅ ALPHA — DONE: IMPL-08-calendar-list-fixes. Leggi agents/state/IMPL-08-calendar-list-fixes.md
```

## File da modificare

`agents/team-lead/.claude/settings.json` — già esiste con `permissions.allow: ["Read(**)"]`.
Mergia senza sovrascrivere le permissions esistenti.

## Note
- Testa il comando con `echo '{"file_path":"agents/state/IMPL-08-calendar-list-fixes.md"}' | <cmd>`
- `asyncRewake: true` implica `async: true` — il hook non blocca, ma sveglia il modello su exit 2
- Non serve gestire `in_progress` — non è actionable per il Lead
