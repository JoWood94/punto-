# Agent LucaLeone — Memory
Updated: 2026-04-13T11:00:00Z
## Completed (last 5)
- task-20260413-3212+ynmp: sharing UI ibrida — badge group/group_add senza tooltip, sezione guest, SharingPanel guest view (owner username + partecipanti + Esci)
- task-20260413-8hqd: FEAT-SN-5 crittografia sharing — guard createNote() + verifica tutto già implementato
- task-20260413-y8lg: BUG loop PWA update → dashboard.ts checkAppVersion() race condition fix
- task-20260413-0q5c: presenza animazioni → note-editor.scss @keyframes presence-enter + presence-pulse
- task-20260413-1rfl: presenza real-time → note.ts (PresenceEntry, writePresence/deletePresence/watchPresence) + note-editor.ts
## Decisions
- REGOLA PERMANENTE (wjdv): dopo ogni task su develop → committa → delega deploy staging a RaffaeleLanzetta automaticamente senza conferma
- sharing badge: group per owned+shared, group_add per guest — NO matTooltip, usa aria-label + icone diverse
- SharingPanel: myRole+ownerUid passati dal note-editor, vista guest read-only con leaveNote()
- FEAT-SN-5: solo createNote() mancava il guard collaboratorUids. Il resto era già presente
- clearEncryptionKeys: DEVE scrivere encryptionSetup:false — senza, unlock loop rotto
## State
Branch: develop | Waiting: commit + deploy staging
