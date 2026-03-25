# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**punto!** is a mobile-first, minimalist note-taking PWA built with Angular 21 and Firebase. It supports real-time cloud sync, push notification reminders, geolocation tagging, and offline mode.

## Commands

All commands run from `frontend/`:

```bash
npm start          # Dev server at https://0.0.0.0:4200 (HTTPS with SSL certs)
npm run build      # Production build → dist/frontend/browser/
npm run watch      # Build in watch mode
npm test           # Unit tests via Vitest
```

Production build (matches CI):
```bash
ng build --configuration production --base-href /punto-/
```

Server (push notification cron, runs from `server/`):
```bash
npm start          # Runs node index.js locally (cron every 1 min)
```

## Architecture

```
younotes/
├── frontend/                  # Angular 21 SPA
│   └── src/app/
│       ├── components/
│       │   ├── login/         # Auth UI (email/password, Apple, password reset)
│       │   ├── dashboard/     # Main view: note list, sidenav, theme picker
│       │   └── note-editor/   # Create/edit form with rich text, geo, reminders
│       ├── services/
│       │   ├── auth.ts        # Firebase Auth (login, register, Apple OAuth)
│       │   ├── note.ts        # Firestore CRUD + offline cache + real-time sync
│       │   └── push-notification.ts  # FCM token registration + foreground messages
│       ├── guards/auth.guard.ts      # Redirects unauthenticated users to /login
│       ├── app.config.ts      # Providers: Firebase, Angular Material, locale it-IT
│       └── app.routes.ts      # Routes: / → /login, /dashboard
├── server/
│   └── index.js               # Node.js cron: queries pending reminders → FCM multicast
└── .github/workflows/
    ├── deploy.yml             # Push to main → build → deploy to GitHub Pages
    └── notify_cron.yml        # Every 5 min → run server/index.js with Firebase secret
```

## Key Architectural Details

**Firebase collections:**
- `notes` — user notes, queried by `uid`. Fields: `title`, `content`, `checklist[]`, `address`, `lat/lon`, `reminderTime` (unix ms), `reminderStatus` (`pending`|`sent`|`null`), `color`, `createdAt`
- `users/{uid}` — stores `fcmTokens[]` for push notification delivery

**Offline support:** `NoteService` uses Firestore's `enableMultiTabIndexedDbPersistence` and maintains a local cache keyed by user UID in localStorage. Snapshot listeners sync changes when online.

**Push notifications flow:** Browser requests FCM permission → token stored in Firestore → GitHub Actions cron triggers `server/index.js` every 5 min → server finds `reminderStatus: 'pending'` notes past their `reminderTime` → sends FCM multicast → marks notes `sent`.

**Deployment:** GitHub Pages serves from branch `release_pages`. The SPA uses a `404.html` copy of `index.html` for client-side routing. Base href is `/punto-/`.

**Locale:** Italian (`it-IT`) is set globally via `LOCALE_ID` and `MAT_DATE_LOCALE`. All Angular Material date pickers output Italian.

**Dev server:** Runs HTTPS on `0.0.0.0:4200` with local SSL certs. Allowed hosts include `192.168.1.5` and `localhost`. SSL cert paths are configured in `angular.json`.
