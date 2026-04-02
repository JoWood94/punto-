<!-- task inviato: 2026-04-02T23:42:48.866Z | task-id: BF-50-reminder-layout-2rows -->
task-id: BF-50-reminder-layout-2rows
state-file: agents/state/BF-50-reminder-layout-2rows.md

status: in_progress
agent: alpha
task: Reminder mobile — Riga 1: Data sola | Riga 2: [Ora:Min] + Ripeti insieme

## Layout target

```
[ Data           📅  ]      ← riga 1, piena larghezza
[ Ora ▾ : Min ▾  ]  [ Ripeti ▾ ]  ← riga 2
```

## Fix in note-editor.scss

```scss
.reminder-inputs {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 8px;
  flex-wrap: wrap;

  .date-field {
    flex: 1 1 100%;   // sempre riga intera
    min-width: 0;
  }

  .time-selects-wrapper {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 2px;

    .hour-field, .minute-field { flex: 1; min-width: 0; }

    .time-separator {
      font-size: 16px;
      font-weight: 500;
      color: rgba(0,0,0,0.5);
      padding-bottom: 18px;
      flex-shrink: 0;
    }
  }

  .recurrence-field {
    flex: 1 1 auto;
    min-width: 90px;
  }
}
```

Con `flex: 1 1 100%` sul `.date-field`, questa occupa sempre tutta la prima riga. `.time-selects-wrapper` e `.recurrence-field` condividono la seconda riga con `flex: 1 1 auto`.

Su desktop (ampio) il comportamento può restare invariato — su schermi larghi tutto sta su una riga grazie a `flex-wrap: wrap` + i campi si espandono.

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed:
bloccato_da:

