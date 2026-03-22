require('dotenv').config();
const admin = require('firebase-admin');
const cron = require('node-cron');
const fs = require('fs');

// Initialize Firebase Admin SDK
// You will need to download your Project's serviceAccountKey.json from Firebase Console -> Project Settings -> Service Accounts -> Generate new private key
const serviceAccountPath = './serviceAccountKey.json';

if (fs.existsSync(serviceAccountPath)) {
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log("Firebase Admin initialized using serviceAccountKey.json");
} else {
  console.log("ATTENZIONE: Nessun serviceAccountKey.json trovato nella cartella server/.");
  console.log("Il server tenterà di usare le variabili d'ambiente di default di Google.");
  admin.initializeApp();
}

const db = admin.firestore();
const messaging = admin.messaging();

console.log("Server di notifica avviato. Esecuzione cron job attiva...");

// Run every minute
cron.schedule('* * * * *', async () => {
  const now = Date.now();
  console.log(`[${new Date().toISOString()}] Controllo promemoria...`);
  
  try {
    const notesSnapshot = await db.collection('notes')
      .where('reminderStatus', '==', 'pending')
      .get();

    if (notesSnapshot.empty) {
      return;
    }

    const tokensCache = {}; 
    const updates = [];
    let sentCount = 0;

    for (const doc of notesSnapshot.docs) {
      const note = doc.data();
      
      if (!note.reminderTime || note.reminderTime > now) {
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

        const payload = {
          notification: {
            title: 'PunTo! - ' + (note.title || 'Nuova Nota'),
            body: bodyText,
          }
        };
        
        try {
          const response = await messaging.sendEachForMulticast({
            tokens: tokens,
            notification: payload.notification
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
      
      updates.push(doc.ref.update({ reminderStatus: 'sent' }));
    }

    await Promise.all(updates);
    if (sentCount > 0) {
      console.log(`Inviate ${sentCount} notifiche con successo.`);
    }
  } catch (error) {
    console.error("Errore durante l'esecuzione del cron job:", error);
  }
});
