// src/background/firebase_utils.js
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth/web-extension';
import { getFirestore } from 'firebase/firestore';
import {
  onAuthStateChanged, signInAnonymously,
  GoogleAuthProvider, signInWithCredential, linkWithCredential,
  signOut, onIdTokenChanged
} from 'firebase/auth/web-extension';
import { downloadPropertyLinksFromFirestore } from './propertyLinks.js';
import { log, error, warn, showStatusMsg } from './index.js'; // Import logging and status functions

const firebaseConfig = {
  apiKey: "AIzaSyDyyvoB--tTFhPXkujZDr8AbDye7goTSF0",
  authDomain: "expedia-price-tracker.firebaseapp.com",
  projectId: "expedia-price-tracker",
  storageBucket: "expedia-price-tracker.firebasestorage.app",
  messagingSenderId: "541814014300",
  appId: "1:541814014300:web:885e4b4805ab0d0b65c199",
  measurementId: "G-2LM8BZW01E"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };


/**
 * Determines the authentication state of the user.
 * If the user is anonymous, sets state to 'anonymous', otherwise 'google'.
 *
 * @type {'anonymous' | 'google'}
 * input {auth} - Firebase auth instance
 * output {void}  
 * storage {chrome.storage.local} - Sets 'authState' to 'anonymous' or 'google'
 */
onAuthStateChanged(auth, (user) => {
  const state = user?.isAnonymous ? 'anonymous' : 'google';
  chrome.storage.local.set({ authState: state }, () => {
    log(`✅ Authentication state set to ${state}`);
  });
});



/**
 * Initiates the Google OAuth 2.0 authentication flow using Chrome Identity API.
 *
 * - Opens a Google sign-in window for the user to select a Google account.
 * - Extracts the access token from the redirect URL upon successful authentication.
 * - Attempts to link the Google credential to the currently authenticated (possibly anonymous) Firebase user.
 * - If the Google account is already linked to another user, signs in with the Google credential instead.
 * - On successful sign-in or linking, triggers loading of property links from Firestore.
 *
 * @function
 * @dependencies
 * - `chrome.identity.getRedirectURL` and `chrome.identity.launchWebAuthFlow` (Chrome Extensions API)
 * - `GoogleAuthProvider`, `auth`, `linkWithCredential`, `signInWithCredential` (Firebase Authentication)
 * - `downloadPropertyLinksFromFirestore` (custom function, called after successful sign-in)
 * - Logging functions: `log`, `error`, `warn`
 *
 * @remarks
 * Requires the "identity" permission in the Chrome extension manifest.
 * Assumes Firebase Authentication is initialized and available as `auth`.
 */
export function launchGoogleOAuth() {
  const clientId = "541814014300-4fhosq4k2rihu2qjrds1sut1cq8r012q.apps.googleusercontent.com";
  const redirectUri = chrome.identity.getRedirectURL();

  log("Redirect URI your extension uses:", redirectUri);

  const authUrl =
    `https://accounts.google.com/o/oauth2/v2/auth` +
    `?client_id=${clientId}` +
    `&response_type=token` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=profile email` +
    `&prompt=select_account`;

  chrome.identity.launchWebAuthFlow(
    { url: authUrl, interactive: true },
    (redirectUrl) => {
      if (chrome.runtime.lastError || !redirectUrl) {
        error("❌ Auth failed or canceled:", chrome.runtime.lastError);
        return;
      }

      // Extract access token
      const m = redirectUrl.match(/access_token=([^&]+)/);
      if (m && m[1]) {
        const accessToken = m[1];
        log("✅ Google Access Token:", accessToken);

        const credential = GoogleAuthProvider.credential(null, accessToken);
        const currentUser = auth.currentUser;

        // 🔄 Upgrade anonymous account to Google account
        linkWithCredential(currentUser, credential)
          .then((userCredential) => {
            log("🔄 Anonymous account upgraded to Google:", userCredential.user);
          })
          .catch(error => {
            if (error.code === 'auth/credential-already-in-use') {
              warn("⚠️ Google account already linked to another user. Switching to signInWithCredential.");
              signInWithCredential(auth, credential)
                .then(userCredential => {
                  log("✅ Signed in with Google:", userCredential.user);
                  downloadPropertyLinksFromFirestore(); // Load property links after sign-in
                })
                .catch(err => {
                  error("❌ Error signing in:", err);
                });
            } else {
              // error("❌ linkWithCredential failed:", error);
              console.error("❌ linkWithCredential failed:", error);
            }
          });

      } else {
        error("❌ No access token found in redirect URL");
      }
    }
  );
}

/**
 * Handles user authentication state at startup.
 * 
 * - If a user is already signed in, logs whether they are a new anonymous user or a returning user.
 * - If no user is signed in, attempts to sign in anonymously.
 * - On successful anonymous login, sets the `loginAtStartup` field in `chrome.storage.local` to `true`.
 * 
 * ## Local Storage Fields Changed
 * - `chrome.storage.local.loginAtStartup`: Set to `true` after a successful anonymous login.
 * 
 * ## Dependencies
 * - Uses Firebase Auth (`onAuthStateChanged`, `signInAnonymously`, `auth`).
 * - Uses Chrome Extension APIs (`chrome.storage.local`).
 * - Relies on `log` and `error` utility functions for logging.
 */
export function loginAtStartup() {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      // First-time or returning?
      const isFirstTime = user.metadata.creationTime === user.metadata.lastSignInTime;

      if (isFirstTime && user.isAnonymous) {
        log("🆕 New anonymous user:", user.uid);
      } else {
        log("🔁 Returning user:", user.isAnonymous ? 'anonymous' : user.email);
      }
    } else {
      // No user? Sign in anonymously
      try {
        const cred = await signInAnonymously(auth);
        log("✅ Anonymous login successful:", cred.user.uid);
        chrome.storage.local.set({ loginAtStartup: true });
      } catch (err) {
        error("❌ Anonymous login failed:", err);
      }
    }
  });
}


/**
 * Logs out the current user from Firebase authentication and clears specific local storage fields.
 *
 * - Removes the following fields from `chrome.storage.local` upon successful sign-out:
 *   - `propertyLinks`
 *   - `prices`
 *   - `notificationEmail`
 * - After logout, signs in anonymously as a fallback.
 * - Logs status messages using `log` and error messages using `error`.
 *
 * @function
 * @returns {Promise<void>} Resolves when logout and anonymous sign-in are complete.
 * @dependsOn signOut, signInAnonymously (from Firebase Auth), chrome.storage.local, log, error
 */
export function LogoutUser() {
  signOut(auth)
    .then(() => {
      log("👋 User signed out successfully.");

      chrome.storage.local.remove(
        ['propertyLinks', 'prices', 'notificationEmail'],
        () => {
          log("✅ Cleared propertyLinks from local storage.");
        }
      );

      return signInAnonymously(auth); // fallback anonymous auth
    })
    .then(() => {
      log("🔄 Reverted to anonymous user after logout.");
    })
    .catch((err) => {
      error("❌ Sign-out error:", err);
    });
}

onIdTokenChanged(auth, async (user) => {
  if (user) {
    log('Token refreshed:');
  }
});




// <--------------------------------------End of Firebase Setup-------------------------------------------------->