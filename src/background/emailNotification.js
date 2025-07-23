import { auth, db } from "./firebase_utils.js";
import { doc, setDoc } from "firebase/firestore";
import { log, warn } from "./index.js";



/**
 * Sends an email request by creating a Firestore document for the current user.
 *
 * Dependencies:
 * - Requires `auth.currentUser` for authentication.
 * - Uses Firestore (`db`, `doc`, `setDoc`) for storing requests.
 * - Reads `notificationEmail` from `chrome.storage.local`.
 *
 * Local Storage Fields:
 * - Reads: `notificationEmail` (used as the recipient email if present).
 *
 * @async
 * @param {Object} requestData - Data containing price information.
 * @param {Object} requestData.prices - Price details to include in the request.
 * @returns {Promise<void>} Resolves when the request is stored.
 */
export async function sendEmailRequest(requestData) {
  const user = auth.currentUser;
  if (!user) {
    warn("❌ No authenticated user found.");
    return;
  }

  // Inline the chrome.storage.local.get wrapped in a promise
  const storedEmail = await new Promise((resolve) => {
    chrome.storage.local.get('notificationEmail', (result) => {
      resolve(result.notificationEmail);
    });
  });

  const email = storedEmail || user.email;

  if (!email) {
    warn("⚠️ No email found to send request.");
    return;
  }

  const requestRef = doc(db, "users", user.uid, "emailRequests", "send"); // Use fixed doc ID

  const finalData = {
    prices: requestData.prices || {},
    email,
    createdAt: new Date(),
  };

  await setDoc(requestRef, finalData);
  log(`✅ Created sendEmail request doc for user ${user.uid}`);
}
