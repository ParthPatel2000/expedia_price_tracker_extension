// background.js

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
importScripts(
  'firebase/firebase-app-compat.js',
  'firebase/firebase-auth-compat.js',
  'firebase/firebase-firestore-compat.js'
);

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

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();


// sync property links from Chrome storage function
function syncPropertyLinksToFirestore() {
  const user = firebase.auth().currentUser;
  if (!user) return console.error("❌ Not logged in");

  chrome.storage.local.get('propertyLinks', (result) => {
    const propertyLinks = result.propertyLinks || [];

    db.collection("users").doc(user.uid).set({ propertyLinks }, { merge: true })
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
  const user = firebase.auth().currentUser;

  const docRef = db.collection("users").doc(user.uid);

  docRef.get().then(doc => {
    if (!doc.exists) {
      console.warn("⚠️ No propertyLinks found in Firestore.");
      // return;
    }

    const data = doc.data();
    const cloudLinks = data.propertyLinks || [];

    chrome.storage.local.set({ propertyLinks: cloudLinks }, () => {
      console.log("✅ Downloaded and saved propertyLinks from Firestore to local storage.");
    });
  }).catch(err => {
    chrome.storage.local.set({ propertyLinks: [] }, () => {
      console.log("⚠️ No propertyLinks found in Firestore. Defaulting to empty array.");
    });
  });
}

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'downloadPropertyLinks') {
    downloadPropertyLinksFromFirestore();
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

        const credential = firebase.auth.GoogleAuthProvider.credential(null, accessToken);
        const currentUser = firebase.auth().currentUser;

        if (currentUser && currentUser.isAnonymous) {
          // 🔄 Upgrade anonymous account to Google account
          currentUser.linkWithCredential(credential)
            .then((userCredential) => {
              console.log("🔄 Anonymous account upgraded to Google:", userCredential.user);
            })
            .catch(error => {
              if (error.code === 'auth/credential-already-in-use') {
                console.warn("⚠️ Google account already linked to another user. Switching to signInWithCredential.");
                firebase.auth().signInWithCredential(credential)
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
        }
        // else {
        //   // 🚪 Direct Google login (user not anonymous or no user)
        //   firebase.auth().signInWithCredential(credential)
        //     .then((userCredential) => {
        //       console.log("✅ Signed in with Google:", userCredential.user);
        //     })
        //     .catch((error) => {
        //       console.error("❌ Firebase sign-in error:", error);
        //     });
        // }
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
    firebase.auth().signOut()
      .then(() => {
        console.log("👋 User signed out successfully.");
        chrome.storage.local.remove('prices', () => {
          console.log("✅ Cleared propertyLinks from local storage.");
        });
        // Optionally sign in anonymously again
        return firebase.auth().signInAnonymously();
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
  firebase.auth().onAuthStateChanged(user => {
    if (user) {
      const isFirstTime = user.metadata.creationTime === user.metadata.lastSignInTime;

      if (isFirstTime) {
        console.log("🆕 First-time Firebase sign-in");
      } else {
        console.log("🔁 Returning Firebase user");
        downloadPropertyLinksFromFirestore();
      }

      if (user.isAnonymous) {
        console.log("🟤 Anonymous user:", user.uid);
        downloadPropertyLinksFromFirestore();
      } else {
        console.log("🟢 Google-authenticated user:", user.email);
        downloadPropertyLinksFromFirestore();
      }



    } else {
      console.log("🚫 No user signed in. Attempting anonymous sign-in...");

      firebase.auth().signInAnonymously()
        .then(() => {
          console.log("✅ Anonymous sign-in successful");
        })
        .catch(error => {
          console.error("❌ Failed to sign in anonymously:", error);
        });
    }
  });
}

//listener for the call from popup.js to start the login process
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'loginAtStartup') {
    loginAtStartup();  // your function can be async if needed
    return true; // ✅ Keeps the message channel open for async operations
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
  chrome.storage.local.get('propertyLinks', (result) => {
    if (Array.isArray(result.propertyLinks)) {
      props = result.propertyLinks;
      console.log("✅ Loaded props from storage:", props);
    } else {
      console.warn("⚠️ No propertyLinks found in storage.");
    }
  });

  const urls = generateUrls();

  chrome.storage.local.get({ backgroundTabs: true }, async (result) => {
    const openInBackground = result.backgroundTabs;

    let tab = await chrome.tabs.create({ url: urls[0], active: !openInBackground });

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];

      if (i > 0) {
        await chrome.tabs.update(tab.id, { url });
      }

      await new Promise(r => setTimeout(r, 6000));

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
