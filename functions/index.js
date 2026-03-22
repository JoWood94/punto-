const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const { logger } = require("firebase-functions");

admin.initializeApp();

exports.sendreminders = onSchedule("every 1 minutes", async (event) => {
  const now = Date.now();
  
  // Find pending notes
  const notesSnapshot = await admin.firestore()
    .collection('notes')
    .where('reminderStatus', '==', 'pending')
    .get();

  if (notesSnapshot.empty) {
    logger.info("No pending reminders.");
    return;
  }

  const tokensCache = {}; 
  const updates = [];
  let sentCount = 0;

  for (const doc of notesSnapshot.docs) {
    const note = doc.data();
    
    // Check if it's actually due
    if (!note.reminderTime || note.reminderTime > now) {
      continue;
    }

    const uid = note.uid;

    if (!tokensCache[uid]) {
      const userDoc = await admin.firestore().collection('users').doc(uid).get();
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
        : 'Hai un promemoria per questa nota!';

      const payload = {
        notification: {
          title: 'Promemoria: ' + (note.title || 'Nuova Nota'),
          body: bodyText,
        }
      };
      
      try {
        const response = await admin.messaging().sendEachForMulticast({
          tokens: tokens,
          notification: payload.notification
        });
        
        // Clean up invalid tokens if necessary
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
           await admin.firestore().collection('users').doc(uid).update({
            fcmTokens: admin.firestore.FieldValue.arrayRemove(...failedTokens)
          });
        }
        
        sentCount++;
      } catch (e) {
        logger.error("Failed to send notification for note", doc.id, e);
      }
    }
    
    // Mark as sent
    updates.push(doc.ref.update({ reminderStatus: 'sent' }));
  }

  await Promise.all(updates);
  logger.info(`Processed ${notesSnapshot.size} notes, sent ${sentCount} notifications.`);
});
