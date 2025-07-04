// background.js
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously, GoogleAuthProvider, signInWithCredential, linkWithCredential, signOut } from 'firebase/auth/web-extension';
import { getFirestore, collection, doc, setDoc, getDoc } from 'firebase/firestore';

const isDev = process.env.NODE_ENV === 'development';

const log = (...args) => isDev && console.log(...args);
const warn = (...args) => isDev && console.warn(...args);
const error = (...args) => isDev && console.error(...args);


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
      .then(() => {
        log("✅ Synced propertyLinks to Firestore");
        chrome.runtime.sendMessage({ action: 'showStatusMsg', msg: "✅ Synced property links to Firestore.", isError: false });
      })
      .catch(err => {
        error("❌ Sync error:", err);
        chrome.runtime.sendMessage({ action: 'showStatusMsg', msg: "❌ Sync error: " + err.message, isError: true });
      });
  });
}


//cannot remove this listener as it is used to sync property links 
// after the user removes a property link from the popup
// Listen for messages from popup or content scripts to sync property links
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
      log("✅ Downloaded and saved propertyLinks from Firestore to local storage.");
      chrome.runtime.sendMessage({ action: 'showStatusMsg', msg: "✅ Downloaded property links from Firestore.", isError: false });
    });
  }).catch(err => {
    chrome.storage.local.set({ propertyLinks: [] }, () => {
      warn("⚠️ No propertyLinks found in Firestore. Defaulting to empty array.");
      chrome.runtime.sendMessage({ action: 'showStatusMsg', msg: "⚠️ No property links found in Firestore.", isError: true });
    });

  });
}

// we will keep this listner but only remove the button from the popup
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
      log("✅ Authentication state set to anonymous");
    });

  } else if (newState === 'google') {
    chrome.storage.local.set({ authState: 'google' }, () => {
      log("✅ Authentication state set to Google");
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
              error("❌ linkWithCredential failed:", error);
            }
          });

      } else {
        error("❌ No access token found in redirect URL");
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
        log("👋 User signed out successfully.");
        chrome.storage.local.remove(['propertyLinks', 'prices', 'isPrimed', 'notificationEmail'], () => {
          log("✅ Cleared propertyLinks from local storage.");
        });
        // Optionally sign in anonymously again
        return signInAnonymously(auth);
      })
      .then(() => {
        log("🔄 Reverted to anonymous user after logout.");
      })
      .catch((error) => {
        error("❌ Sign-out error:", error);
      });
  }
});

// <--------------------------------------End of Firebase Setup-------------------------------------------------->

//<--------------------------------------Notification System ------------------------------------------------------>

// Function to update the sendEmail request document in Firestore
async function updateSendEmailRequest(userId, requestData) {
  const requestRef = doc(db, "users", userId, "emailRequests", "send");
  const user = auth.currentUser;

  let email = '';

  // Wrap chrome.storage.local.get in a promise
  const getFromStorage = (key) => {
    return new Promise((resolve) => {
      chrome.storage.local.get(key, (result) => {
        resolve(result[key]);
      });
    });
  };

  const storedEmail = await getFromStorage('notificationEmail');

  if (!user) {
    if (!storedEmail) {
      warn("⚠️ No email found to update sendEmail request.");
      return;
    }
    email = storedEmail;
  } else {
    // Authenticated: use storedEmail if it exists, otherwise fallback to user.email
    email = storedEmail || user.email;
  }

  await setDoc(requestRef, {
    sendEmail: requestData.sendEmail || false,
    prices: requestData.prices || 0,
    email,
    updatedAt: new Date(),
    ...requestData
  }, { merge: true });

  log(`✅ Updated sendEmail request doc for user ${userId}`);
}


// Function to send Prices data to email request from Firestore
async function sendEmailRequest() {

  const { prices } = await chrome.storage.local.get('prices');
  await chrome.storage.local.get('isPrimed', (result) => {
    if (!result.isPrimed) {
      primeSendEmailRequest();
      chrome.storage.local.set({ isPrimed: true });
    }
  });

  const requestData = {
    sendEmail: true,
    prices: prices || {}, // Set to 0 or any default value
  };
  const user = auth.currentUser;
  if (user) {
    updateSendEmailRequest(user.uid, requestData);
  }
}

// Function to prime the sendEmail request document
// This is called once to set up the initial request structure as firebase trigger
// only works when the document is updated
// This is to ensure that the document exists before the user clicks the Send Email button
async function primeSendEmailRequest() {
  const user = auth.currentUser;
  const requestData = {
    sendEmail: false, // Initially set to false
    prices: {}, // Prices will be filled later
  };

  // Update Firestore with the request data
  updateSendEmailRequest(user.uid, requestData);
}


// Listen for Send Email button click in popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'sendEmailRequest') {
    const user = auth.currentUser;
    if (user) {
      sendEmailRequest(user.uid, message.data);
    }
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
        log("🆕 New anonymous user:", user.uid);
      } else {
        log("🔁 Returning user:", user.isAnonymous ? 'anonymous' : user.email);
      }
    } else {
      // No user? Sign in anonymously
      try {
        const cred = await signInAnonymously(auth);
        log("✅ Anonymous login successful:", cred.user.uid);
        authStateChange('anonymous');
        chrome.storage.local.set({ loginAtStartup: true });
      } catch (err) {
        error("❌ Anonymous login failed:", err);
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
    log("✅ Loaded props from storage:", props);
  } else {
    warn("⚠️ No propertyLinks found in storage.");
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.propertyLinks) {
    chrome.storage.local.get('propertyLinks', (result) => {
      if (Array.isArray(result.propertyLinks)) {
        props = result.propertyLinks;
        log("✅ Loaded props from storage:", props);
      } else {
        warn("⚠️ No propertyLinks found in storage.");
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

    //send email request to Firestore and prices from local storage
    sendEmailRequest();
  });
}

// Listen for the extension icon click to start scraping and send email request
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
  log(`📩 Received price for ${message.hotelName}: ${message.price}`);

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
        log(`💾 Stored/updated price for ${message.hotelName}:`, prices[message.hotelName]);
      });
    });
  }
});


// <------------------------------------------------------------------------------------------------>

//<--------------------------------------End of background.js-------------------------------------------------->
