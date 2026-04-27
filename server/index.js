require('dotenv').config();
const admin = require('firebase-admin');
const cron = require('node-cron');
const fs = require('fs');

// Initialize Firebase Admin SDK
const serviceAccountPath = './serviceAccountKey.json';

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log("Firebase Admin inizializzato correttamente tramite GitHub Secret.");
  } catch(e) {
    console.error("ERRORE CRITICO: Il formato del SECRET 'FIREBASE_SERVICE_ACCOUNT' non è un JSON valido.");
    console.error("Dettaglio errore parsing:", e.message);
    process.exit(1);
  }
} else if (fs.existsSync(serviceAccountPath)) {
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log("Firebase Admin inizializzato tramite serviceAccountKey.json locale.");
} else {
  console.error("ERRORE: Nessuna credenziale Firebase trovata!");
  console.log("Assicurati che 'FIREBASE_SERVICE_ACCOUNT' sia impostato nei GitHub Secrets (per GHA)");
  console.log("o che 'server/serviceAccountKey.json' sia presente (per esecuzione locale).");
  
  if (process.env.GITHUB_ACTIONS === 'true') {
    process.exit(1);
  } else {
    console.log("Tentativo di inizializzazione predefinita (GCP/ADC)...");
    admin.initializeApp();
  }
}

const db = admin.firestore();
const messaging = admin.messaging();

/**
 * Estrae tutti i token FCM da un user doc.
 * Priorità: fcmDevices (un token per device) + fcmTokens legacy deduplicati.
 */
function extractTokens(userData) {
  const fromDevices = Object.values(userData.fcmDevices ?? {}).filter(t => typeof t === 'string');
  const legacy = (userData.fcmTokens ?? []).filter(t => !fromDevices.includes(t));
  return [...fromDevices, ...legacy];
}

/**
 * Rimuove token invalidi da fcmDevices (per device-id) e da fcmTokens (legacy).
 * deviceMap: { [deviceId]: token } dal tokensCache dell'utente.
 */
async function removeInvalidTokens(uid, failedTokens, deviceMap) {
  const update = { fcmTokens: admin.firestore.FieldValue.arrayRemove(...failedTokens) };
  for (const [devId, tok] of Object.entries(deviceMap)) {
    if (failedTokens.includes(tok)) {
      update[`fcmDevices.${devId}`] = admin.firestore.FieldValue.delete();
    }
  }
  await db.collection('users').doc(uid).update(update);
}

/**
 * Calcola il prossimo orario di promemoria in base alla ricorrenza.
 * @param {number} currentTime - Timestamp attuale del promemoria (ms)
 * @param {string} recurrence - 'daily' | 'weekly' | 'monthly' | 'yearly'
 * @returns {number} - Prossimo timestamp (ms)
 */
function calculateNextReminder(currentTime, recurrence) {
  const d = new Date(currentTime);
  switch (recurrence) {
    case 'daily':   d.setDate(d.getDate() + 1);          break;
    case 'weekly':  d.setDate(d.getDate() + 7);          break;
    case 'monthly': d.setMonth(d.getMonth() + 1);        break;
    case 'yearly':  d.setFullYear(d.getFullYear() + 1);  break;
  }
  return d.getTime();
}

function formatSmartDate(ms, language = 'it') {
  if (!ms) return null;
  const tz = 'Europe/Rome';
  const toDay = (d) => new Intl.DateTimeFormat('it-IT', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const reminderDate = new Date(ms);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const time = new Intl.DateTimeFormat('it-IT', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(reminderDate);
  const labels = language === 'en' ? { today: 'Today', tomorrow: 'Tomorrow' } : { today: 'Oggi', tomorrow: 'Domani' };
  if (toDay(reminderDate) === toDay(now)) return `${labels.today} ${time}`;
  if (toDay(reminderDate) === toDay(tomorrow)) return `${labels.tomorrow} ${time}`;
  const dayMonth = new Intl.DateTimeFormat('it-IT', { timeZone: tz, day: '2-digit', month: '2-digit' }).format(reminderDate);
  return `${dayMonth} ${time}`;
}

/** Massimo offset notifica supportato dall'editor (DAY_1 = 1440 min).
 *  La query Firestore viene allargata di questa finestra in avanti così che
 *  un doc con reminderTime = T e notifyOffsetMin = 1440 venga comunque
 *  pescato quando now ≥ T - 1440*60000.
 *  Filtro in-memory scarta i doc la cui notifyTime è ancora nel futuro. */
const MAX_NOTIFY_OFFSET_MS = 1440 * 60_000; // 1 giorno

async function checkAndSendReminders() {
  const now = Date.now();
  console.log(`[${new Date().toISOString()}] Controllo promemoria in sospeso...`);

  try {
    // Query allargata: recupera i doc il cui reminderTime è nei prossimi MAX_NOTIFY_OFFSET_MS.
    // Questo copre il caso in cui l'utente ha impostato un offset (es. 1 giorno prima):
    // reminderTime = 18:00 domani, ma notifyTime = 18:00 oggi → senza allargamento il doc
    // non sarebbe incluso nella query `reminderTime <= now`.
    const notesSnapshot = await db.collection('notes')
      .where('reminderStatus', '==', 'pending')
      .where('reminderTime', '<=', now + MAX_NOTIFY_OFFSET_MS)
      .get();

    if (notesSnapshot.empty) {
      console.log("Nessun promemoria in sospeso ora.");
      return;
    }

    // Prefetch snooze/mute attivi: due collectionGroup query (index-backed).
    // snoozeMap → noteId → Set<uid> skippati (unione). Snooze temporaneo cleanup
    // post-send. Mute persistente → preserved (tracked in mutedMap per escluderlo).
    const snoozeMap = new Map();
    const mutedMap = new Map();
    const addSkip = (map, noteId, uid) => {
      if (!map.has(noteId)) map.set(noteId, new Set());
      map.get(noteId).add(uid);
    };
    try {
      const snoozeSnap = await db.collectionGroup('reminderSnoozes')
        .where('snoozedUntil', '>', now)
        .get();
      for (const s of snoozeSnap.docs) {
        addSkip(snoozeMap, s.ref.parent.parent.id, s.id);
      }
      if (snoozeSnap.size > 0) {
        console.log(`Snoozes temporanei attivi: ${snoozeSnap.size}.`);
      }
    } catch (e) {
      console.warn('[snooze] collectionGroup query (snoozedUntil) failed:', e.message);
    }
    try {
      const mutedSnap = await db.collectionGroup('reminderSnoozes')
        .where('muted', '==', true)
        .get();
      for (const s of mutedSnap.docs) {
        const noteId = s.ref.parent.parent.id;
        addSkip(snoozeMap, noteId, s.id);
        addSkip(mutedMap, noteId, s.id);
      }
      if (mutedSnap.size > 0) {
        console.log(`Mute permanenti attivi: ${mutedSnap.size}.`);
      }
    } catch (e) {
      console.warn('[snooze] collectionGroup query (muted) failed:', e.message);
    }

    const tokensCache = {};
    const snoozeUpdates = [];
    let sentCount = 0;

    for (const doc of notesSnapshot.docs) {
      const note = doc.data();

      // Normalizza reminderTime: Firestore Admin può restituire un oggetto Timestamp
      // invece di un numero. .toMillis() lo converte in ms unix se necessario.
      const reminderMs = note.reminderTime?.toMillis
        ? note.reminderTime.toMillis()
        : Number(note.reminderTime);

      if (!reminderMs) continue;

      // Gli eventi calendario sono gestiti esclusivamente da checkAndSendEventReminders.
      // Skipparli qui evita il doppio invio quando un evento ha sia reminderStatus:'pending'
      // che una entry nella sub-collection eventReminders.
      if (note.type === 'event') continue;

      // Calcola il momento effettivo di notifica applicando l'offset (se presente).
      // notifyTime = reminderTime - notifyOffsetMin * 60000.
      // Doc legacy senza notifyOffsetMin → offset 0 → notifyTime = reminderTime.
      const offsetMin = typeof note.notifyOffsetMin === 'number' && note.notifyOffsetMin > 0
        ? note.notifyOffsetMin
        : 0;
      const notifyTime = reminderMs - offsetMin * 60_000;

      // Filtro in-memory: scarta i doc la cui notifyTime è ancora nel futuro.
      if (notifyTime > now) {
        continue;
      }

      // Calcola l'updatePayload prima della transaction (ricorrenza vs one-shot).
      const recurrence = note.recurrence ?? 'none';
      const endDate = typeof note.recurrenceEndDate === 'number' ? note.recurrenceEndDate : null;
      let updatePayload;
      if (recurrence !== 'none') {
        // Skip-ahead: avanza finché nextTime > now (evita raffica di catch-up
        // quando il cron è restato indietro o il doc era pending da giorni).
        let nextTime = calculateNextReminder(reminderMs, recurrence);
        let skipped = 0;
        while (nextTime <= now && (!endDate || nextTime <= endDate) && skipped < 10000) {
          const advanced = calculateNextReminder(nextTime, recurrence);
          if (advanced <= nextTime) break;
          nextTime = advanced;
          skipped++;
        }
        if (skipped > 0) {
          console.log(`Skipped ${skipped} occorrenze passate per ${recurrence} (note ${doc.id}).`);
        }
        const expired = endDate && nextTime > endDate;
        if (!expired) {
          updatePayload = {
            reminderStatus: 'pending',
            reminderTime: nextTime,
            ...(offsetMin > 0 ? { notifyOffsetMin: offsetMin } : {}),
          };
          if (note.blocks && Array.isArray(note.blocks)) {
            updatePayload.blocks = note.blocks.map(b => {
              if (b.type === 'reminder') {
                const next = { ...b, time: nextTime, status: 'pending' };
                if (offsetMin > 0 && !next.notifyOffsetMin) next.notifyOffsetMin = offsetMin;
                return next;
              }
              return b;
            });
          }
          console.log(`Promemoria ricorrente (${recurrence}) rischedulato a ${new Date(nextTime).toISOString()}${offsetMin > 0 ? ` (notifica ${offsetMin}min prima)` : ''}`);
        } else {
          updatePayload = { reminderStatus: 'sent' };
          if (note.blocks && Array.isArray(note.blocks)) {
            updatePayload.blocks = note.blocks.map(b => {
              if (b.type === 'reminder') return { ...b, status: 'sent' };
              return b;
            });
          }
          console.log(`Ricorrenza ${recurrence} terminata (endDate superata), promemoria segnato come sent`);
        }
      } else {
        updatePayload = { reminderStatus: 'sent' };
        if (note.blocks && Array.isArray(note.blocks)) {
          updatePayload.blocks = note.blocks.map(b => {
            if (b.type === 'reminder') return { ...b, status: 'sent' };
            return b;
          });
        }
      }

      // Claim atomico: applica updatePayload solo se reminderStatus è ancora 'pending'
      // E reminderTime non è cambiato. Questo previene duplicati quando due run del cron
      // si sovrappongono: il secondo run trova il doc già aggiornato e skippa.
      let claimed = false;
      try {
        claimed = await db.runTransaction(async t => {
          const snap = await t.get(doc.ref);
          if (!snap.exists) return false;
          const d = snap.data();
          if (d.reminderStatus !== 'pending') return false;
          const currentMs = d.reminderTime?.toMillis ? d.reminderTime.toMillis() : Number(d.reminderTime);
          if (currentMs !== reminderMs) return false; // già rischedulato da un altro run
          t.update(doc.ref, updatePayload);
          return true;
        });
      } catch (e) {
        console.error(`[claim] Transaction fallita per nota ${doc.id}:`, e.message);
        continue;
      }
      if (!claimed) {
        console.log(`[claim] Nota ${doc.id} già processata da altro run, skip.`);
        continue;
      }

      const uid = note.uid;
      const snoozedUids = snoozeMap.get(doc.id) ?? new Set();

      if (!tokensCache[uid]) {
        const userDoc = await db.collection('users').doc(uid).get();
        const userData = userDoc.exists ? userDoc.data() : {};
        tokensCache[uid] = {
          tokens: extractTokens(userData),
          fcmDevices: userData.fcmDevices ?? {},
          notifTitleEnabled: userData.notifTitleEnabled === true,
          language: userData.language ?? 'it',
        };
      }

      const { tokens, notifTitleEnabled, language } = tokensCache[uid];

      // Fetch collaborator tokens. Skip:
      //  - chi è snoozed/muted (reminderSnoozes)
      //  - chi ha notificationsEnabled === false (opt-out esplicito, pattern A Fase 1)
      //    NOTE: undefined o true → notifica (compat. con collab. pre-pattern A)
      const collabUidTokenPairs = [];
      try {
        const collaboratorsSnap = await db.collection('notes').doc(doc.id)
          .collection('collaborators')
          .get();
        for (const collabDoc of collaboratorsSnap.docs) {
          const collabUid = collabDoc.id;
          const collabData = collabDoc.data() ?? {};
          if (collabData.notificationsEnabled === false) {
            continue;
          }
          if (snoozedUids.has(collabUid)) {
            continue;
          }
          if (!tokensCache[collabUid]) {
            const userDoc = await db.collection('users').doc(collabUid).get();
            const userData = userDoc.exists ? userDoc.data() : {};
            tokensCache[collabUid] = {
              tokens: extractTokens(userData),
              fcmDevices: userData.fcmDevices ?? {},
              notifTitleEnabled: userData.notifTitleEnabled === true,
              language: userData.language ?? 'it',
            };
          }
          for (const t of tokensCache[collabUid].tokens) {
            collabUidTokenPairs.push({ uid: collabUid, token: t });
          }
        }
      } catch (e) {
        console.error(`Errore fetch collaboratori per nota ${doc.id}:`, e.message);
      }

      // Owner tokens: skip se owner snoozato
      const ownerUidTokenPairs = snoozedUids.has(uid)
        ? []
        : tokens.map(t => ({ uid, token: t }));
      const allUidTokenPairs = [...ownerUidTokenPairs, ...collabUidTokenPairs];
      const allTokens = allUidTokenPairs.map(p => p.token);

      if (snoozedUids.size > 0) {
        console.log(`Nota ${doc.id}: snoozed uids=${[...snoozedUids].join(',')}, recipients=${allTokens.length}`);
      }

      const strings = NOTIF_STRINGS[language] ?? NOTIF_STRINGS['it'];

      if (allTokens.length > 0) {
        const PGP_MARKER = '-----BEGIN PGP MESSAGE-----';
        const isEncrypted = (val) => typeof val === 'string' && val.startsWith(PGP_MARKER);

        const rawTitle = note.title;
        const msgTitle = (notifTitleEnabled && rawTitle && !isEncrypted(rawTitle))
          ? rawTitle
          : strings.defaultTitle;
        const bodyText = formatSmartDate(reminderMs, language) ?? strings.bodyNoDate;

        try {
          const response = await messaging.sendEachForMulticast({
            tokens: allTokens,
            webpush: {
              notification: {
                title: msgTitle,
                body: bodyText,
                icon: '/icons/icon-192x192.png',
                tag: doc.id,
                data: { noteId: doc.id }
              },
              // fcm_options.link rimosso: il custom notificationclick handler nel SW
              // gestisce tutta la navigazione. Mantenerlo causava doppia apertura finestra
              // e conflitto con l'handler FCM SDK.
              data: {
                title: msgTitle,
                body: bodyText,
                noteId: doc.id,
              }
            }
          });

          // Group failed tokens by uid for per-user cleanup
          const failedByUid = {};
          response.responses.forEach((resp, idx) => {
            if (!resp.success) {
              const error = resp.error;
              if (error.code === 'messaging/invalid-registration-token' ||
                  error.code === 'messaging/registration-token-not-registered') {
                const failedUid = allUidTokenPairs[idx].uid;
                if (!failedByUid[failedUid]) failedByUid[failedUid] = [];
                failedByUid[failedUid].push(allUidTokenPairs[idx].token);
              }
            }
          });

          for (const [failUid, failTokens] of Object.entries(failedByUid)) {
            await removeInvalidTokens(failUid, failTokens, tokensCache[failUid]?.fcmDevices ?? {});
          }

          sentCount++;
        } catch (e) {
          console.error("Failed to send notification for note", doc.id, e);
        }
      }

      // Cleanup snoozes temporanei processati: lo scope è l'istanza appena emessa/rischedulata.
      // I doc con muted=true sono esclusi — il mute è permanente e va preservato
      // per le successive istanze ricorrenti.
      const mutedUidsForNote = mutedMap.get(doc.id) ?? new Set();
      const uidsToCleanup = [...snoozedUids].filter(u => !mutedUidsForNote.has(u));
      if (uidsToCleanup.length > 0) {
        const batch = db.batch();
        for (const snoozedUid of uidsToCleanup) {
          batch.delete(db.collection('notes').doc(doc.id)
            .collection('reminderSnoozes').doc(snoozedUid));
        }
        snoozeUpdates.push(batch.commit());
      }
    }

    await Promise.all(snoozeUpdates);
    if (sentCount > 0) {
      console.log(`Inviate ${sentCount} notifiche con successo.`);
    } else {
      console.log("Nessun promemoria da inviare in questo slot temporale.");
    }
  } catch (error) {
    console.error("Errore durante l'esecuzione del controllo promemoria:", error);
    throw error; // Rilancia per far fallire il GHA correttamente
  }
}

const COMPLETION_STRINGS = {
  it: {
    title: 'punto! — Promemoria evaso',
    body: (name) => `${name} ha evaso un promemoria condiviso`,
  },
  en: {
    title: 'punto! — Reminder completed',
    body: (name) => `${name} completed a shared reminder`,
  },
};

async function checkAndSendCompletions() {
  console.log(`[${new Date().toISOString()}] Controllo notifiche evasione condivisa...`);
  const snap = await db.collection('notes')
    .where('completionNotifyPending', '==', true)
    .get();

  if (snap.empty) {
    console.log("Nessuna evasione da notificare.");
    return;
  }

  const tokensCache = {};
  const updates = [];
  let sentCount = 0;

  for (const doc of snap.docs) {
    const note = doc.data();
    const byUid = note.completionNotifyBy;
    const byName = note.completionNotifyByName || 'A collaborator';
    const ownerUid = note.uid;

    // Recipients = owner + collaborators (escluso completatore)
    const recipientUids = new Set([ownerUid, ...(note.collaboratorUids ?? [])]);
    recipientUids.delete(byUid);

    const resetPayload = {
      completionNotifyPending: false,
      completionNotifyBy: admin.firestore.FieldValue.delete(),
      completionNotifyByName: admin.firestore.FieldValue.delete(),
      completionNotifyAt: admin.firestore.FieldValue.delete(),
    };

    if (recipientUids.size === 0) {
      updates.push(doc.ref.update(resetPayload));
      continue;
    }

    const allUidTokenPairs = [];
    for (const uid of recipientUids) {
      if (!tokensCache[uid]) {
        const userDoc = await db.collection('users').doc(uid).get();
        const userData = userDoc.exists ? userDoc.data() : {};
        tokensCache[uid] = {
          tokens: extractTokens(userData),
          fcmDevices: userData.fcmDevices ?? {},
          language: userData.language ?? 'it',
        };
      }
      for (const t of tokensCache[uid].tokens) {
        allUidTokenPairs.push({ uid, token: t, language: tokensCache[uid].language });
      }
    }

    if (allUidTokenPairs.length === 0) {
      updates.push(doc.ref.update(resetPayload));
      continue;
    }

    // Raggruppa per lingua (body localizzato)
    const byLanguage = {};
    for (const p of allUidTokenPairs) {
      const lang = p.language in COMPLETION_STRINGS ? p.language : 'it';
      if (!byLanguage[lang]) byLanguage[lang] = [];
      byLanguage[lang].push(p);
    }

    for (const [lang, pairs] of Object.entries(byLanguage)) {
      const strings = COMPLETION_STRINGS[lang];
      const title = strings.title;
      const body = strings.body(byName);
      const tokens = pairs.map(p => p.token);

      try {
        const resp = await messaging.sendEachForMulticast({
          tokens,
          webpush: {
            notification: {
              title,
              body,
              icon: '/icons/icon-192x192.png',
              tag: `completion-${doc.id}`,
              data: { noteId: doc.id, kind: 'completion' },
            },
            data: { title, body, noteId: doc.id, kind: 'completion' },
          },
        });
        sentCount++;

        const failedByUid = {};
        resp.responses.forEach((r, idx) => {
          if (!r.success) {
            const err = r.error;
            if (err.code === 'messaging/invalid-registration-token' ||
                err.code === 'messaging/registration-token-not-registered') {
              const failUid = pairs[idx].uid;
              if (!failedByUid[failUid]) failedByUid[failUid] = [];
              failedByUid[failUid].push(pairs[idx].token);
            }
          }
        });
        for (const [failUid, failTokens] of Object.entries(failedByUid)) {
          await removeInvalidTokens(failUid, failTokens, tokensCache[failUid]?.fcmDevices ?? {});
        }
      } catch (e) {
        console.error(`Failed completion notify for note ${doc.id} lang ${lang}:`, e.message);
      }
    }

    updates.push(doc.ref.update(resetPayload));
  }

  await Promise.all(updates);
  if (sentCount > 0) {
    console.log(`Inviate ${sentCount} notifiche evasione.`);
  } else {
    console.log("Nessuna notifica evasione inviata in questo slot.");
  }
}

// ─── Event reminders (per-user, sub-collection) ─────────────────────────────
// Modello: ogni utente ha il proprio sub-doc notes/{eventId}/eventReminders/{uid}
// con `offsetsMinutes: number[]`. Il cron calcola targetTime = eventStart - offset*60s
// (no time storato: se l'owner sposta l'evento, l'offset segue automaticamente).
// `sentOffsets` evita doppi invii. `lastFiredEventStart` resetta sentOffsets quando
// l'owner sposta l'eventStart (così un evento "rinviato" rispara i reminder).
async function checkAndSendEventReminders() {
  const now = Date.now();
  console.log(`[${new Date().toISOString()}] Controllo event reminders per-user...`);

  // Finestra eventi: da [now - 1h] a [now + 8gg]. L'offset "Custom" può superare
  // DAY_1 (1440min): un utente può impostare un reminder 2+ giorni prima dell'evento.
  // 8 giorni copre qualsiasi offset ragionevole; il filtro in-memory su targetTime
  // scarta gli eventi il cui reminder non è ancora scaduto.
  const windowStart = now - 60 * 60 * 1000;
  const windowEnd = now + 8 * 24 * 60 * 60 * 1000;

  let eventsSnap;
  try {
    eventsSnap = await db.collection('notes')
      .where('type', '==', 'event')
      .where('eventStart', '>=', windowStart)
      .where('eventStart', '<=', windowEnd)
      .get();
  } catch (e) {
    console.error('[event-reminders] events query failed:', e.message);
    return;
  }

  if (eventsSnap.empty) {
    console.log('Nessun evento nella finestra di check.');
    return;
  }

  const tokensCache = {};
  const updates = [];
  let sentCount = 0;

  for (const eventDoc of eventsSnap.docs) {
    const event = eventDoc.data();
    if (event.cancelled === true) continue;
    const eventStart = event.eventStart && event.eventStart.toMillis
      ? event.eventStart.toMillis()
      : Number(event.eventStart);
    if (!eventStart) continue;
    const calendarId = event.calendarId;
    if (!calendarId) continue;

    let remSnap;
    try {
      remSnap = await db.collection('notes').doc(eventDoc.id).collection('eventReminders').get();
    } catch (e) {
      console.warn(`[event ${eventDoc.id}] eventReminders fetch failed:`, e.message);
      continue;
    }
    if (remSnap.empty) continue;

    let subsSnap;
    try {
      subsSnap = await db.collection('calendars').doc(calendarId).collection('subscribers').get();
    } catch (e) {
      console.warn(`[event ${eventDoc.id}] subscribers fetch failed:`, e.message);
      continue;
    }
    const subsByUid = new Map();
    for (const s of subsSnap.docs) {
      subsByUid.set(s.id, s.data() || {});
    }

    for (const remDoc of remSnap.docs) {
      const uid = remDoc.id;
      const remData = remDoc.data() || {};
      const offsets = Array.isArray(remData.offsetsMinutes) ? remData.offsetsMinutes : [];
      const lastFired = typeof remData.lastFiredEventStart === 'number' ? remData.lastFiredEventStart : null;
      // Reset sentOffsets se l'owner ha spostato eventStart dopo l'ultimo fire.
      const sentOffsets = (lastFired === eventStart && Array.isArray(remData.sentOffsets))
        ? remData.sentOffsets
        : [];

      const subInfo = subsByUid.get(uid);
      if (!subInfo) continue; // utente non più subscriber del calendario
      if (subInfo.notificationsEnabled === false) continue;

      const newSent = [...sentOffsets];
      let triggered = false;

      for (const offset of offsets) {
        if (typeof offset !== 'number' || offset < 0) continue;
        if (newSent.includes(offset)) continue;
        const targetTime = eventStart - offset * 60_000;
        if (targetTime > now) continue;            // troppo presto
        if (targetTime < now - 60 * 60 * 1000) continue;  // grace 1h scaduta

        if (!tokensCache[uid]) {
          const userDoc = await db.collection('users').doc(uid).get();
          const userData = userDoc.exists ? userDoc.data() : {};
          tokensCache[uid] = {
            tokens: extractTokens(userData),
            fcmDevices: userData.fcmDevices ?? {},
            language: userData.language ?? 'it',
            notifTitleEnabled: userData.notifTitleEnabled === true,
          };
        }
        const { tokens, language, notifTitleEnabled } = tokensCache[uid];
        if (!tokens || tokens.length === 0) continue;

        const PGP_MARKER = '-----BEGIN PGP MESSAGE-----';
        const isEncrypted = (val) => typeof val === 'string' && val.startsWith(PGP_MARKER);
        const strings = NOTIF_STRINGS[language] ?? NOTIF_STRINGS.it;
        const rawTitle = event.title;
        const msgTitle = (notifTitleEnabled && rawTitle && !isEncrypted(rawTitle))
          ? rawTitle
          : strings.defaultTitle;
        const bodyText = formatSmartDate(eventStart, language) ?? strings.bodyNoDate;

        try {
          const resp = await messaging.sendEachForMulticast({
            tokens,
            webpush: {
              notification: {
                title: msgTitle,
                body: bodyText,
                icon: '/icons/icon-192x192.png',
                tag: `event-${eventDoc.id}-${offset}`,
                data: { noteId: eventDoc.id }
              },
              data: { title: msgTitle, body: bodyText, noteId: eventDoc.id }
            }
          });

          // Cleanup token invalidi per uid
          const failed = [];
          resp.responses.forEach((r, idx) => {
            if (!r.success) {
              const code = r.error && r.error.code;
              if (code === 'messaging/invalid-registration-token' ||
                  code === 'messaging/registration-token-not-registered') {
                failed.push(tokens[idx]);
              }
            }
          });
          if (failed.length > 0) {
            await removeInvalidTokens(uid, failed, tokensCache[uid]?.fcmDevices ?? {});
          }
          sentCount++;
        } catch (e) {
          console.error(`[event ${eventDoc.id}] send failed for uid=${uid}:`, e.message);
        }

        newSent.push(offset);
        triggered = true;
      }

      if (triggered) {
        updates.push(remDoc.ref.update({
          sentOffsets: newSent,
          lastFiredEventStart: eventStart,
        }));
      }
    }
  }

  await Promise.all(updates);
  if (sentCount > 0) {
    console.log(`Inviati ${sentCount} reminder evento per-user.`);
  } else {
    console.log('Nessun event reminder da inviare.');
  }
}

const NOTIF_STRINGS = {
  it: {
    defaultTitle: 'Promemoria',
    bodyWithDate: (d) => d,
    bodyNoDate: 'Promemoria in scadenza',
  },
  en: {
    defaultTitle: 'Reminder',
    bodyWithDate: (d) => d,
    bodyNoDate: 'Upcoming reminder',
  },
};

async function runAll() {
  await checkAndSendReminders();
  await checkAndSendEventReminders();
  await checkAndSendCompletions();
}

if (process.env.GITHUB_ACTIONS === 'true') {
  console.log("Ambiente GitHub Actions rilevato...");
  runAll().then(() => {
    console.log("Run GHA terminato correttamente.");
    process.exit(0);
  }).catch(err => {
    console.error(err);
    process.exit(1);
  });
} else {
  console.log("Avvio del server di test locale 24/7. Cron job ogni minuto...");
  cron.schedule('* * * * *', runAll);
}
