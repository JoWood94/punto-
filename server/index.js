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
 * Calcola il prossimo orario di promemoria in base alla ricorrenza.
 * @param {number} currentTime - Timestamp attuale del promemoria (ms)
 * @param {string} recurrence - 'daily' | 'weekly' | 'monthly'
 * @returns {number} - Prossimo timestamp (ms)
 */
function calculateNextReminder(currentTime, recurrence) {
  const d = new Date(currentTime);
  switch (recurrence) {
    case 'daily':   d.setDate(d.getDate() + 1);     break;
    case 'weekly':  d.setDate(d.getDate() + 7);     break;
    case 'monthly': d.setMonth(d.getMonth() + 1);   break;
  }
  return d.getTime();
}

async function checkAndSendReminders() {
  const now = Date.now();
  console.log(`[${new Date().toISOString()}] Controllo promemoria in sospeso...`);
  
  try {
    const notesSnapshot = await db.collection('notes')
      .where('reminderStatus', '==', 'pending')
      .get();

    if (notesSnapshot.empty) {
      console.log("Nessun promemoria in sospeso ora.");
      return;
    }

    const tokensCache = {}; 
    const updates = [];
    let sentCount = 0;

    for (const doc of notesSnapshot.docs) {
      const note = doc.data();

      // Normalizza reminderTime: Firestore Admin può restituire un oggetto Timestamp
      // invece di un numero. .toMillis() lo converte in ms unix se necessario.
      const reminderMs = note.reminderTime?.toMillis
        ? note.reminderTime.toMillis()
        : Number(note.reminderTime);

      if (!reminderMs || reminderMs > now) {
        continue;
      }

      const uid = note.uid;

      if (!tokensCache[uid]) {
        const userDoc = await db.collection('users').doc(uid).get();
        if (userDoc.exists && userDoc.data().fcmTokens) {
          tokensCache[uid] = userDoc.data().fcmTokens;
        } else {
          tokensCache[uid] = [];
        }
      }

      const tokens = tokensCache[uid];

      if (tokens && tokens.length > 0) {
        const bodyText = note.content 
          ? note.content.replace(/<[^>]*>?/gm, '').substring(0, 100) 
          : 'Hai un promemoria in scadenza!';

        const msgTitle = 'PunTo! - ' + (note.title || 'Nuova Nota');

        try {
          const response = await messaging.sendEachForMulticast({
            tokens: tokens,
            // webpush.notification sovrascrive root notification per i token browser.
            // title e body vanno esplicitamente in webpush.notification, altrimenti
            // FCM invia solo l'icona e la notifica viene scartata silenziosamente.
            webpush: {
              notification: {
                title: msgTitle,
                body: bodyText,
                icon: '/punto-/icons/icon-192x192.png',
              },
              // data: usato dal foreground handler (onMessage) dell'app Angular
              data: {
                title: msgTitle,
                body: bodyText,
              }
            }
          });
          
          const failedTokens = [];
          response.responses.forEach((resp, idx) => {
            if (!resp.success) {
              const error = resp.error;
              if (error.code === 'messaging/invalid-registration-token' ||
                  error.code === 'messaging/registration-token-not-registered') {
                failedTokens.push(tokens[idx]);
              }
            }
          });

          if (failedTokens.length > 0) {
             await db.collection('users').doc(uid).update({
              fcmTokens: admin.firestore.FieldValue.arrayRemove(...failedTokens)
            });
          }
          
          sentCount++;
        } catch (e) {
          console.error("Failed to send notification for note", doc.id, e);
        }
      }
      
      // Ricorrenza: rischedulare invece di segnare come 'sent'
      const recurrence = note.recurrence ?? 'none';
      if (recurrence !== 'none' && reminderMs) {
        const nextTime = calculateNextReminder(reminderMs, recurrence);
        const updatePayload = { reminderStatus: 'pending', reminderTime: nextTime };

        // Aggiorna anche il ReminderBlock nell'array blocks (nuovo formato)
        if (note.blocks && Array.isArray(note.blocks)) {
          updatePayload.blocks = note.blocks.map(b => {
            if (b.type === 'reminder') {
              return { ...b, time: nextTime, status: 'pending' };
            }
            return b;
          });
        }
        updates.push(doc.ref.update(updatePayload));
        console.log(`Promemoria ricorrente (${recurrence}) rischedulato a ${new Date(nextTime).toISOString()}`);
      } else {
        const updatePayload = { reminderStatus: 'sent' };
        // Aggiorna anche il ReminderBlock nell'array blocks (nuovo formato)
        if (note.blocks && Array.isArray(note.blocks)) {
          updatePayload.blocks = note.blocks.map(b => {
            if (b.type === 'reminder') return { ...b, status: 'sent' };
            return b;
          });
        }
        updates.push(doc.ref.update(updatePayload));
      }
    }

    await Promise.all(updates);
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

if (process.env.GITHUB_ACTIONS === 'true') {
  console.log("Ambiente GitHub Actions rilevato...");
  checkAndSendReminders().then(() => {
    console.log("Run GHA terminato correttamente.");
    process.exit(0);
  }).catch(err => {
    console.error(err);
    process.exit(1);
  });
} else {
  console.log("Avvio del server di test locale 24/7. Cron job ogni minuto...");
  cron.schedule('* * * * *', checkAndSendReminders);
}
