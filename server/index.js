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
  // fcmDevices supporta due schemi:
  //  - legacy: { uuid: "token..." } (string value)
  //  - nuovo:  { ios-WxH: { token, label, userAgent, lastSeen } } (object value)
  const fromDevices = [];
  for (const v of Object.values(userData.fcmDevices ?? {})) {
    if (typeof v === 'string') fromDevices.push(v);
    else if (v && typeof v.token === 'string') fromDevices.push(v.token);
  }
  // Se fcmDevices è presente, ignora completamente fcmTokens legacy per evitare duplicati.
  if (fromDevices.length > 0) return fromDevices;
  return (userData.fcmTokens ?? []).filter(t => typeof t === 'string');
}

/**
 * Rimuove token invalidi da fcmDevices (per device-id) e da fcmTokens (legacy).
 * deviceMap: { [deviceId]: token } dal tokensCache dell'utente.
 */
async function removeInvalidTokens(uid, failedTokens, deviceMap) {
  const update = { fcmTokens: admin.firestore.FieldValue.arrayRemove(...failedTokens) };
  for (const [devId, val] of Object.entries(deviceMap)) {
    const tok = typeof val === 'string' ? val : (val && val.token);
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
    console.log(`Query: ${notesSnapshot.size} doc(s) con reminderStatus=pending.`);

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
      if (note.type === 'event') {
        console.log(`[skip-event] note=${doc.id} uid=${note.uid} reminderTime=${new Date(reminderMs).toISOString()}`);
        continue;
      }

      // Calcola il momento effettivo di notifica applicando l'offset (se presente).
      // notifyTime = reminderTime - notifyOffsetMin * 60000.
      // Doc legacy senza notifyOffsetMin → offset 0 → notifyTime = reminderTime.
      const offsetMin = typeof note.notifyOffsetMin === 'number' && note.notifyOffsetMin > 0
        ? note.notifyOffsetMin
        : 0;
      const notifyTime = reminderMs - offsetMin * 60_000;

      // Filtro in-memory: scarta i doc la cui notifyTime è ancora nel futuro.
      if (notifyTime > now) {
        console.log(`[too-early] note=${doc.id} uid=${note.uid} notifyTime=${new Date(notifyTime).toISOString()} (fra ${Math.round((notifyTime - now) / 60000)}min)`);
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
          language: userData.language ?? 'it',
        };
      }

      const { tokens, language } = tokensCache[uid];
      console.log(`[Server][Push][Note ${doc.id}] owner uid=${uid} tokens=${tokens.length} language=${language}`);

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
        const AES_MARKER = 'AES1:';
        const isEncrypted = (val) => typeof val === 'string'
          && (val.startsWith(PGP_MARKER) || val.startsWith(AES_MARKER));

        const rawTitle = note.title;
        const titleIsEncrypted = isEncrypted(rawTitle);
        // RF-05 Fase 2: il titolo è sempre il fallback generico. Il SW decifra
        // il titolo via encryptedTitle (notifTitles/{uid}) e lo mostra in chiaro.
        // notifTitleEnabled è deprecato e ignorato.
        const msgTitle = strings.defaultTitle;
        const bodyText = formatSmartDate(reminderMs, language) ?? strings.bodyNoDate;

        const safeTitle = (rawTitle && !titleIsEncrypted) ? `"${rawTitle}"` : '[cifrato]';
        console.log(`[send] note=${doc.id} uid=${uid} title=${safeTitle} reminderTime=${new Date(reminderMs).toISOString()} body="${bodyText}" tokens=${allTokens.length}`);

        // ── RF-05 Fase 2 — per-token refactor ───────────────────────────────
        // Costruisci un messaggio dedicato per ogni (uid, token), così possiamo
        // includere `encryptedTitle` letto da notes/{noteId}/notifTitles/{uid}
        // — cifrato con la notification-key di QUEL recipient. Il SW di quel
        // recipient userà la propria notif-key da IDB per decifrarlo.
        try {
          // Pre-fetch in parallelo dei notifTitles per ogni uid distinto fra i
          // recipients. Limita le get() a un solo doc per uid (non per token).
          const distinctRecipientUids = Array.from(new Set(allUidTokenPairs.map(p => p.uid)));
          console.log(`[Server][Push][Note ${doc.id}] started, recipients(token-level)=${allUidTokenPairs.length}, distinctUids=${distinctRecipientUids.length}, titleIsEncrypted=${titleIsEncrypted}`);
          const notifTitleByUid = {};
          if (titleIsEncrypted) {
            const notifTitleSnaps = await Promise.all(
              distinctRecipientUids.map(rUid =>
                db.doc(`notes/${doc.id}/notifTitles/${rUid}`).get()
                  .catch(err => {
                    console.warn(`[Server][Push] notifTitles fetch failed uid=${rUid} note=${doc.id}:`, err.message);
                    return null;
                  })
              )
            );
            distinctRecipientUids.forEach((rUid, i) => {
              const snap = notifTitleSnaps[i];
              if (snap && snap.exists) {
                const sd = snap.data() || {};
                const encAt = sd.encryptedAt && sd.encryptedAt.toDate
                  ? sd.encryptedAt.toDate().toISOString()
                  : (sd.encryptedAt || 'N/A');
                console.log(`[Server][Push][Note ${doc.id}] notifTitles found uid=${rUid} encryptedAt=${encAt} ctLen=${(sd.encryptedTitle || '').length}`);
                notifTitleByUid[rUid] = sd.encryptedTitle || null;
              } else {
                console.log(`[Server][Push][Note ${doc.id}] notifTitles MISSING uid=${rUid} → fallback "${strings.defaultTitle}"`);
                notifTitleByUid[rUid] = null;
              }
            });
          } else {
            console.log(`[Server][Push][Note ${doc.id}] title is plaintext, no notifTitles needed`);
          }

          // Costruisci un messaggio per token. notification.title è SEMPRE
          // fallback-safe: il SW (combined-sw.js) sostituirà titolo dopo decrypt.
          const messages = allUidTokenPairs.map(({ uid: rUid, token }) => {
            const hasEncrypted = !!notifTitleByUid[rUid];
            const dataPayload = {
              noteId: String(doc.id),
              type: 'note-reminder',
              fallbackTitle: strings.defaultTitle,
              body: String(bodyText),
              isEncrypted: titleIsEncrypted ? '1' : '0',
              recipientUid: String(rUid),
            };
            if (titleIsEncrypted && hasEncrypted) {
              dataPayload.encryptedTitle = String(notifTitleByUid[rUid]);
            }
            // Backward-compat Fase 1: passa anche `ciphertext` per i tab che
            // ancora avessero il SW vecchio. Il SW Fase 2 ignora `ciphertext`
            // se `encryptedTitle` è presente.
            if (titleIsEncrypted && typeof rawTitle === 'string') {
              dataPayload.ciphertext = rawTitle;
            }
            // Per-recipient log: utile per capire quale device manca il
            // notifTitles (e quindi vedrà sempre il fallback "Promemoria").
            console.log(`[Server][Push][Recipient] noteId=${doc.id} uid=${rUid} tokenPrefix=${token.substring(0, 20)}... hasEncrypted=${hasEncrypted} dataKeys=${Object.keys(dataPayload).join(',')}`);
            return {
              token,
              webpush: {
                notification: {
                  title: msgTitle,
                  body: bodyText,
                  icon: '/icons/icon-192x192.png',
                  tag: doc.id,
                  data: { noteId: doc.id }
                },
                data: dataPayload,
                headers: { Urgency: 'high' }
              }
            };
          });

          console.log(`[Server][Push] sending ${messages.length} per-token messages for note ${doc.id}`);
          const response = await messaging.sendEach(messages);
          console.log(`[Server][Push] sendEach result: success=${response.successCount} failure=${response.failureCount}`);
          response.responses.forEach((r, idx) => {
            const pair = allUidTokenPairs[idx];
            if (r.success) {
              console.log(`[Server][Push] OK[${idx}] uid=${pair.uid} messageId=${r.messageId}`);
            } else {
              console.log(`[Server][Push] FAILURE[${idx}] uid=${pair.uid} code=${r.error && r.error.code} message=${r.error && r.error.message}`);
            }
          });

          // Group failed tokens by uid for per-user cleanup
          const failedByUid = {};
          response.responses.forEach((resp, idx) => {
            if (!resp.success) {
              const error = resp.error;
              if (error && (error.code === 'messaging/invalid-registration-token' ||
                  error.code === 'messaging/registration-token-not-registered')) {
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
  console.log(`Query eventi: ${eventsSnap.size} evento/i nella finestra [now-1h, now+8gg].`);

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
          };
        }
        const { tokens, language } = tokensCache[uid];
        if (!tokens || tokens.length === 0) continue;

        const PGP_MARKER = '-----BEGIN PGP MESSAGE-----';
        const AES_MARKER = 'AES1:';
        const isEncrypted = (val) => typeof val === 'string'
          && (val.startsWith(PGP_MARKER) || val.startsWith(AES_MARKER));
        const strings = NOTIF_STRINGS[language] ?? NOTIF_STRINGS.it;
        const rawTitle = event.title;
        const titleIsEncrypted = isEncrypted(rawTitle);
        // RF-05 Fase 2: sempre fallback; il SW decifra via encryptedTitle.
        const msgTitle = strings.defaultTitle;
        const bodyText = formatSmartDate(eventStart, language) ?? strings.bodyNoDate;

        const safeEvTitle = (rawTitle && !titleIsEncrypted) ? `"${rawTitle}"` : '[cifrato]';
        console.log(`[event-send] event=${eventDoc.id} uid=${uid} title=${safeEvTitle} offset=${offset}min targetTime=${new Date(targetTime).toISOString()} body="${bodyText}" tokens=${tokens.length}`);

        try {
          // ── RF-05 Fase 2 — per-token refactor ──────────────────────────────
          // Eventi: lo `uid` reminder è uno solo (il subscriber del calendar),
          // ma può avere N device. Pre-fetch del proprio notifTitles UNA volta,
          // poi costruisco un messaggio per ogni token. Il `recipientUid` nel
          // data payload è sempre questo uid.
          let encryptedTitleForUid = null;
          if (titleIsEncrypted) {
            try {
              const notifSnap = await db.doc(`notes/${eventDoc.id}/notifTitles/${uid}`).get();
              if (notifSnap.exists) {
                const sd = notifSnap.data() || {};
                const encAt = sd.encryptedAt && sd.encryptedAt.toDate
                  ? sd.encryptedAt.toDate().toISOString()
                  : (sd.encryptedAt || 'N/A');
                console.log(`[Server][Push][Event ${eventDoc.id}] notifTitles found uid=${uid} encryptedAt=${encAt} ctLen=${(sd.encryptedTitle || '').length}`);
                encryptedTitleForUid = sd.encryptedTitle || null;
              } else {
                console.log(`[Server][Push][Event ${eventDoc.id}] notifTitles MISSING uid=${uid} → fallback`);
              }
            } catch (err) {
              console.warn(`[Server][Push][event] notifTitles fetch failed uid=${uid} event=${eventDoc.id}:`, err.message);
            }
          }
          const hasEncrypted = !!encryptedTitleForUid;
          console.log(`[Server][Push][Event ${eventDoc.id}] target uid=${uid} tokens=${tokens.length} hasEncrypted=${hasEncrypted} fallback=${!hasEncrypted ? strings.defaultTitle : 'N/A'}`);

          const messages = tokens.map((token, ti) => {
            const dataPayload = {
              noteId: String(eventDoc.id),
              type: 'event-reminder',
              fallbackTitle: strings.defaultTitle,
              body: String(bodyText),
              isEncrypted: titleIsEncrypted ? '1' : '0',
              recipientUid: String(uid),
            };
            if (titleIsEncrypted && hasEncrypted) {
              dataPayload.encryptedTitle = String(encryptedTitleForUid);
            }
            // Backward-compat Fase 1: passa anche `ciphertext` raw.
            if (titleIsEncrypted && typeof rawTitle === 'string') {
              dataPayload.ciphertext = rawTitle;
            }
            console.log(`[Server][Push][Recipient][Event] uid=${uid} tokenIdx=${ti} tokenPrefix=${token.substring(0, 20)}... dataKeys=${Object.keys(dataPayload).join(',')}`);
            return {
              token,
              webpush: {
                notification: {
                  title: msgTitle,
                  body: bodyText,
                  icon: '/icons/icon-192x192.png',
                  tag: `event-${eventDoc.id}-${offset}`,
                  data: { noteId: eventDoc.id }
                },
                data: dataPayload,
                headers: { Urgency: 'high' }
              }
            };
          });

          console.log(`[Server][Push] sending ${messages.length} per-token messages for event ${eventDoc.id}`);
          const resp = await messaging.sendEach(messages);
          console.log(`[Server][Push] sendEach result (event ${eventDoc.id}): success=${resp.successCount} failure=${resp.failureCount}`);
          resp.responses.forEach((r, idx) => {
            if (r.success) {
              console.log(`[Server][Push][Event] OK[${idx}] uid=${uid} messageId=${r.messageId}`);
            } else {
              console.log(`[Server][Push][Event] FAILURE[${idx}] uid=${uid} code=${r.error && r.error.code} message=${r.error && r.error.message}`);
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
