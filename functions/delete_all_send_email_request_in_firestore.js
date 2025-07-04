const admin = require('firebase-admin');

// Replace with your service account path
const serviceAccount = require('./expedia-price-tracker-firebase-adminsdk-fbsvc-18f579e443.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function deleteAllSendDocs() {
  const usersSnap = await db.collection('users').get();

  for (const userDoc of usersSnap.docs) {
    const userId = userDoc.id;
    const sendDocRef = db.doc(`users/${userId}/emailRequests/send`);
    
    try {
      await sendDocRef.delete();
      console.log(`🗑️ Deleted send doc for user ${userId}`);
    } catch (err) {
      console.error(`❌ Failed to delete for ${userId}:`, err);
    }
  }

  console.log("✅ All done.");
}

deleteAllSendDocs();
