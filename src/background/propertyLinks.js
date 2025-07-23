import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase_utils.js';
import { log, error, warn, showStatusMsg } from './index.js';


/**
 * Synchronizes the 'propertyLinks' array from Chrome's local storage to the Firestore database
 * under the current user's document. Merges the updated property links with any existing data.
 *
 * Dependencies:
 * - Requires the user to be authenticated (`auth.currentUser`).
 * - Reads 'propertyLinks' from Chrome's local storage (`chrome.storage.local`).
 * - Updates the 'propertyLinks' field in Firestore under the path: `users/{user.uid}`.
 * - Uses Firestore's `setDoc` with `{ merge: true }` to avoid overwriting other user data.
 * - Relies on global `db`, `auth`, `log`, `error`, and `showStatusMsg` functions/objects.
 *
 * Side Effects:
 * - Displays status messages to the user via `showStatusMsg`.
 * - Logs success or error messages using `log` and `error`.
 */
export function syncPropertyLinksToFirestore() {
  const user = auth.currentUser;

  chrome.storage.local.get('propertyLinks', (result) => {
    const propertyLinks = result.propertyLinks || [];

    setDoc(doc(db, "users", user.uid), { propertyLinks }, { merge: true })
      .then(() => {
        log("✅ Synced propertyLinks to Firestore");
        showStatusMsg("✅ Synced property links to Firestore.", false);
      })
      .catch(err => {
        error("❌ Sync error:", err);
        showStatusMsg("❌ Sync error: " + err.message, true);
      });
  });
}


// Function to download property links from Firestore to Chrome storage
/**
 * Downloads the user's property links from Firestore and saves them to Chrome's local storage.
 * If no property links are found in Firestore, defaults to an empty array in local storage.
 * Displays a status message indicating success or warning.
 *
 * @function
 * @returns {void}
 */
export function downloadPropertyLinksFromFirestore() {
  const user = auth.currentUser;

  const docRef = doc(db, "users", user.uid);

  getDoc(docRef).then(doc => {
    const data = doc.data();
    const cloudLinks = data.propertyLinks || [];

    chrome.storage.local.set({ propertyLinks: cloudLinks }, () => {
      log("✅ Downloaded and saved propertyLinks from Firestore to local storage.");
      showStatusMsg("✅ Downloaded property links from Firestore.", false);
    });
  }).catch(err => {
    chrome.storage.local.set({ propertyLinks: [] }, () => {
      warn("⚠️ No propertyLinks found in Firestore. Defaulting to empty array.");
      showStatusMsg("⚠️ No property links found in Firestore.", true);
    });

  });
}