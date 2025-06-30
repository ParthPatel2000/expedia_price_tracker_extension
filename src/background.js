// background.js

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
// importScripts(
//   '../../firebase/firebase-app-compat.js',
//   '../../firebase/firebase-auth-compat.js',
//   '../../firebase/firebase-firestore-compat.js'
// );


import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously, GoogleAuthProvider, signInWithCredential, linkWithCredential, signOut } from 'firebase/auth/web-extension';
import { getFirestore, collection, doc, setDoc, getDoc } from 'firebase/firestore';

// Initialize Firebase
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


// sync property links from Chrome storage function
function syncPropertyLinksToFirestore() {
  const user = auth.currentUser;

  chrome.storage.local.get('propertyLinks', (result) => {
    const propertyLinks = result.propertyLinks || [];

    setDoc(doc(db, "users", user.uid), { propertyLinks }, { merge: true })
      .then(() => console.log("✅ Synced propertyLinks to Firestore"))
      .catch(err => console.error("❌ Sync error:", err));
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'syncPropertyLinks') {
    syncPropertyLinksToFirestore();
  }
});

// Function to download property links from Firestore to Chrome storage
function downloadPropertyLinksFromFirestore() {
  const user = auth.currentUser;

  const docRef = doc(db, "users", user.uid);

  getDoc(docRef).then(doc => {
    const data = doc.data();
    const cloudLinks = data.propertyLinks || [];

    chrome.storage.local.set({ propertyLinks: cloudLinks }, () => {
      console.log("✅ Downloaded and saved propertyLinks from Firestore to local storage.");
    });
  }).catch(err => {
    chrome.storage.local.set({ propertyLinks: [] }, () => {
      console.warn("⚠️ No propertyLinks found in Firestore. Defaulting to empty array.");
    });
  });
}

// Function to update the sendEmail request document in Firestore
async function updateSendEmailRequest(userId, requestData) {
  const requestRef = doc(db, "users", userId, "emailRequests", "send");

  await setDoc(requestRef, {
    sendEmail: requestData.sendEmail || false,
    price: requestData.price || 0,
    updatedAt: new Date(),
    ...requestData
  }, { merge: true });

  console.log(`✅ Updated sendEmail request doc for user ${userId}`);
}


//listen for change in user email and create user document in firestore
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.notificationEmail) {
    const newEmail = changes.notificationEmail.newValue;

    const user = auth.currentUser;
    if (user) {      
      //just for testing purposes
      updateSendEmailRequest(user.uid, {
        sendEmail: false,
        price: 0,
        email: newEmail
      });
      console.log(`✅ User document updated with new email: ${newEmail}`);
      //just for testing purposes
    }
  }
});

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'downloadPropertyLinks') {
    downloadPropertyLinksFromFirestore();
  }
});


//function to change user's authentication state
//saves a uthentication state to local storage
function authStateChange(newState) {
  if (newState === 'anonymous') {
    chrome.storage.local.set({ authState: 'anonymous' }, () => {
      console.log("✅ Authentication state set to anonymous");
    });

  } else if (newState === 'google') {
    chrome.storage.local.set({ authState: 'google' }, () => {
      console.log("✅ Authentication state set to Google");
    });

  }
  return;
}

// Monitor auth state changes
onAuthStateChanged(auth, (user) => {
  if (user) {
    authStateChange(user.isAnonymous ? 'anonymous' : 'google');
  } else {
    authStateChange('none');
  }
});



// Function to launch Google OAuth flow using web app authentication
function launchGoogleOAuth() {
  const clientId = "541814014300-4fhosq4k2rihu2qjrds1sut1cq8r012q.apps.googleusercontent.com";
  const redirectUri = chrome.identity.getRedirectURL();

  console.log("Redirect URI your extension uses:", redirectUri);

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
        console.error("❌ Auth failed or canceled:", chrome.runtime.lastError);
        return;
      }

      // Extract access token
      const m = redirectUrl.match(/access_token=([^&]+)/);
      if (m && m[1]) {
        const accessToken = m[1];
        console.log("✅ Google Access Token:", accessToken);

        const credential = GoogleAuthProvider.credential(null, accessToken);
        const currentUser = auth.currentUser;

        // 🔄 Upgrade anonymous account to Google account
        linkWithCredential(currentUser, credential)
          .then((userCredential) => {
            console.log("🔄 Anonymous account upgraded to Google:", userCredential.user);
          })
          .catch(error => {
            if (error.code === 'auth/credential-already-in-use') {
              console.warn("⚠️ Google account already linked to another user. Switching to signInWithCredential.");
              signInWithCredential(auth, credential)
                .then(userCredential => {
                  console.log("✅ Signed in with Google:", userCredential.user);
                  downloadPropertyLinksFromFirestore(); // Load property links after sign-in
                })
                .catch(err => {
                  console.error("❌ Error signing in:", err);
                });
            } else {
              console.error("❌ linkWithCredential failed:", error);
            }
          });

      } else {
        console.error("❌ No access token found in redirect URL");
      }
    }
  );
}


// Function to log out the user
// This will clear the local storage and Firestore data
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'logoutUser') {
    signOut(auth)
      .then(() => {
        console.log("👋 User signed out successfully.");
        chrome.storage.local.remove(['propertyLinks', 'prices'], () => {
          console.log("✅ Cleared propertyLinks from local storage.");
        });
        // Optionally sign in anonymously again
        return signInAnonymously(auth);
      })
      .then(() => {
        console.log("🔄 Reverted to anonymous user after logout.");
      })
      .catch((error) => {
        console.error("❌ Sign-out error:", error);
      });
  }
});





// <--------------------------------------Startup Sequence------------------------------------------------------>
function loginAtStartup() {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      // Save auth state locally
      authStateChange(user.isAnonymous ? 'anonymous' : 'google');

      // First-time or returning?
      const isFirstTime = user.metadata.creationTime === user.metadata.lastSignInTime;

      if (isFirstTime && user.isAnonymous) {
        console.log("🆕 New anonymous user:", user.uid);
      } else {
        console.log("🔁 Returning user:", user.isAnonymous ? 'anonymous' : user.email);
      }
    } else {
      // No user? Sign in anonymously
      try {
        const cred = await signInAnonymously(auth);
        console.log("✅ Anonymous login successful:", cred.user.uid);
        authStateChange('anonymous');
        chrome.storage.local.set({ loginAtStartup: true });
      } catch (err) {
        console.error("❌ Anonymous login failed:", err);
      }
    }
  });
}


//listener for the call from popup.js to start the login process
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'loginAtStartup') {
    loginAtStartup();  // your function can be async if needed
    // return true; // ✅ Keeps the message channel open for async operations
  }
});




// <------------------------------------------Scraping logic--------------------------------------------------->
let props = []; // Global variable to hold properties loaded from storage

chrome.storage.local.get('propertyLinks', (result) => {
  if (Array.isArray(result.propertyLinks)) {
    props = result.propertyLinks;
    console.log("✅ Loaded props from storage:", props);
  } else {
    console.warn("⚠️ No propertyLinks found in storage.");
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.propertyLinks) {
    chrome.storage.local.get('propertyLinks', (result) => {
      if (Array.isArray(result.propertyLinks)) {
        props = result.propertyLinks;
        console.log("✅ Loaded props from storage:", props);
      } else {
        console.warn("⚠️ No propertyLinks found in storage.");
      }
    });
  }
});


function getRandomizedDelay(baseSeconds) {
  const jitter = Math.random() * 2 - 1; // random number between -1 and +1
  const finalDelay = baseSeconds + jitter;
  return Math.max(2, finalDelay) * 1000; // ensure minimum 2s delay
}


function formatDate(date) {
  const year = date.getFullYear();
  // getMonth() returns 0-11, so add 1 and pad with leading zero
  const month = String(date.getMonth() + 1).padStart(2, '0');
  // getDate() returns day of month
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function updateUrlWithDates(originalUrl, checkIn, checkOut) {
  let url = new URL(originalUrl);
  url.searchParams.set("d1", checkIn);
  url.searchParams.set("startDate", checkIn);
  url.searchParams.set("d2", checkOut);
  url.searchParams.set("endDate", checkOut);
  return url.toString();
}

function generateUrls() {
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86400000);

  const checkIn = formatDate(today);
  const checkOut = formatDate(tomorrow);

  return props.map(p => updateUrlWithDates(p.url, checkIn, checkOut));
}

async function openTabsAndScrape() {

  const urls = generateUrls();

  chrome.storage.local.get({ backgroundTabs: true }, async (result) => {
    const openInBackground = result.backgroundTabs;

    let tab = await chrome.tabs.create({ url: urls[0], active: !openInBackground });

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];

      if (i > 0) {
        await chrome.tabs.update(tab.id, { url });
      }

      const delay = await new Promise((resolve) => {
        chrome.storage.local.get({ pageDelay: 6 }, (res) => resolve(res.pageDelay * 1000));
      });

      // let delayMs = getRandomizedDelay(delay / 1000); // Convert to seconds and apply jitter

      await new Promise(r => setTimeout(r, getRandomizedDelay(delay / 1000)));


      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
    }

    chrome.tabs.remove(tab.id, () => {
      console.log("Tab closed after scraping all properties");
    });
  });
}

// Listen for the extension icon click to start scraping
chrome.action.onClicked.addListener(() => {
  openTabsAndScrape();
});

//listen for Google OAuth login request
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startGoogleOAuth') {
    launchGoogleOAuth();
  }
});

// main scraping and storage logic
chrome.runtime.onMessage.addListener((message) => {
  console.log(`📩 Received price for ${message.hotelName}: ${message.price}`);

  if (message.action === 'startScraping') {
    openTabsAndScrape();
  }

  if (message.hotelName && message.price) {
    chrome.storage.local.get({ prices: {} }, (result) => {
      const prices = result.prices;

      prices[message.hotelName] = {
        price: message.price,
        timestamp: new Date().toISOString()
      };

      chrome.storage.local.set({ prices }, () => {
        console.log(`💾 Stored/updated price for ${message.hotelName}:`, prices[message.hotelName]);
      });
    });
  }
});
// <------------------------------------------------------------------------------------------------>
