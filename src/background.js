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
        showStatusMsg("✅ Synced property links to Firestore.", false);
      })
      .catch(err => {
        error("❌ Sync error:", err);
        showStatusMsg("❌ Sync error: " + err.message, true);
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
      showStatusMsg("✅ Downloaded property links from Firestore.", false);
    });
  }).catch(err => {
    chrome.storage.local.set({ propertyLinks: [] }, () => {
      warn("⚠️ No propertyLinks found in Firestore. Defaulting to empty array.");
      showStatusMsg("⚠️ No property links found in Firestore.", true);
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
    log("✅ Loaded propertyLinks from storage:", props);
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
  if (!urls || urls.length === 0) {
    showStatusMsg("⚠️ No URLs to scrape.", true);
    return;
  }


  const delay = await new Promise(resolve =>
    chrome.storage.local.get({ pageDelay: 6 }, res => resolve(res.pageDelay * 1000))
  );

  //fetch the scrape config from the remote JSON file
  const config = await getScrapeConfig();

  chrome.storage.local.get({ backgroundTabs: true }, async (result) => {
    const openInBackground = result.backgroundTabs;

    let tab = await chrome.tabs.create({ url: urls[0], active: !openInBackground });

    try {
      
      for (let i = 0; i < urls.length; i++) {
        chrome.runtime.sendMessage({ action: 'scrapingProgress', current: i + 1, total: urls.length });
        
        const url = urls[i];
        if (i > 0) {
          await chrome.tabs.update(tab.id, { url });
        }

        let delayMs = getRandomizedDelay(delay / 1000); // Convert to seconds and apply jitter
        await new Promise(r => setTimeout(r, delayMs));
        
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: runScrapingScript,
            args: [config],
          });
        } catch (err) {
          showStatusMsg("❌ Error executing scraping script: " + err.message, true);
          error("❌ Error executing scraping script:", err);
          continue; // Skip to next URL if script fails
        }
      }
    } catch (err) {
      showStatusMsg("❌ Error during scraping: " + err.message, true);
      error("❌ Error during scraping:", err);
    }

    chrome.tabs.remove(tab.id, () => {
      console.log("Tab closed after scraping all properties");
    });
  });
}

// Listen for the extension icon click to start scraping and send email request
chrome.action.onClicked.addListener(() => {
  openTabsAndScrape();
});

async function getScrapeConfig() {
  const configUrl = 'https://parthpatel2000.github.io/configs/expedia_config.json';

  const defaultConfig = {
    priceSelector: '.uitk-text-default-theme',
    soldOutSelector: '.uitk-text-negative-theme'
  };

  try {
    const response = await fetch(configUrl);
    if (!response.ok) throw new Error('Failed to fetch config');
    const config = await response.json();

    log('✅ Fetched config:', config);

    return config;
  } catch (err) {
    console.warn('⚠️ Using default config due to fetch error:', err);
    return defaultConfig;
  }
}

function runScrapingScript(config) {
  const getFirstMatchingElement = (selectors, filterFn = () => true) => {
    for (const selector of selectors) {
      const elements = Array.from(document.querySelectorAll(selector)).filter(filterFn);
      if (elements.length > 0) return elements[0];
    }
    return null;
  };

  let price = '';

  const soldOutElement = getFirstMatchingElement(
    config.soldOutSelectors || [config.soldOutSelector],
    el => el.textContent.toLowerCase().includes('sold out')
  );

  if (soldOutElement) {
    price = 'Sold Out';
  } else {
    const keywords = config.priceKeywords?.map(k => k.toLowerCase()) || ['nightly', '$'];

    const priceElement = getFirstMatchingElement(
      config.priceSelectors || [config.priceSelector],
      el => {
        const text = el.textContent.toLowerCase();
        return keywords.some(keyword => text.includes(keyword));
      }
    );

    if (priceElement) {
      // Optionally strip all keywords (not just 'nightly') from the result
      price = priceElement.textContent;
      keywords.forEach(keyword => {
        price = price.replace(new RegExp(keyword, 'gi'), '');
      });
      price = price.trim();
    } else {
      price = 'Price not found';
    }
  }

  const params = new URLSearchParams(window.location.search);
  const hotelName = params.get('hotelName') || 'Unknown Hotel';

  console.log(`💾 Stored/updated price for ${hotelName}:`, price);
  chrome.runtime.sendMessage({ price, hotelName });
}



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
        timestamp: new Date().toLocaleString() // Store as local date string for easier readability 

        // timestamp: new Date().toISOString()  // will use this if i turn this into a price tracker
        // For now, we will store the timestamp as a local date string for easier readability 
        // will need to change the popup.js to use this format
      };

      chrome.storage.local.set({ prices }, () => {
        log(`💾 Stored/updated price for ${message.hotelName}:`, prices[message.hotelName]);
      });
    });
  }
});


//<--------------------------------------Notification System ------------------------------------------------------>
// Function to send email request document in Firestore
async function sendEmailRequest(requestData) {
  const user = auth.currentUser;
  if (!user) {
    warn("❌ No authenticated user found.");
    return;
  }

  const getFromStorage = (key) => {
    return new Promise((resolve) => {
      chrome.storage.local.get(key, (result) => resolve(result[key]));
    });
  };

  const storedEmail = await getFromStorage('notificationEmail');
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



// Listen for Send Email button click in popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'sendEmailRequest') {
    sendEmailRequest(message.requestData);
  }
});



// <--------------------------------------Alarm System------------------------------------------------------>
// Schedule a daily scrape at a specific time
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'dailyScrape') {
    log('⏰ Daily scrape alarm triggered');

    const { dailyScrapeNotificationEnabled } = await new Promise((resolve) => {
      chrome.storage.local.get(['dailyScrapeNotificationEnabled'], resolve);
    });

    try {
      await openTabsAndScrape(); // 🔄 Wait until all scraping is done

      if (dailyScrapeNotificationEnabled) {
        log("📧 Sending email request for scraped prices");
        chrome.storage.local.get({ prices: {} }, async (result) => {
          await sendEmailRequest({ prices: result.prices }); // ⬅️ Email only after scrape finishes
        });
      } else {
        log("📧 Daily scrape notification is disabled, not sending email request.");
      }

    } catch (err) {
      console.error("❌ Error during daily scrape or email:", err);
    }
  }
});



function scheduleDailyScrape(hour = 11, minute = 10) {
  chrome.storage.local.set({ dailyScrapeTime: { hour, minute } }, () => {
    log(`✅ Saved daily scrape time at ${hour}:${minute < 10 ? '0' : ''}${minute} in local storage`);
  });

  chrome.alarms.clear('dailyScrape', () => {
    const now = new Date();
    let when = new Date();

    when.setHours(hour, minute, 0, 0);
    if (when <= now) {
      // If the time already passed today, schedule for tomorrow
      when.setDate(when.getDate() + 1);
    }

    chrome.alarms.create('dailyScrape', { when: when.getTime(), periodInMinutes: 24 * 60 });
    log(`Scheduled daily scrape alarm at ${hour}:${minute < 10 ? '0' : ''}${minute}`);
    showStatusMsg(`Scheduled daily scrape at ${hour}:${minute < 10 ? '0' : ''}${minute}`, false);
  });
}

//listen for the scheduleDailyScrape message from popup.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'scheduleDailyScrape') {
    const { hour, minute } = message;
    scheduleDailyScrape(hour, minute);
  }
});

//listen for the  cancelDailyScrape message to cancel the alarm
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'cancelDailyScrape') {
    chrome.alarms.get('dailyScrape', (alarm) => {
      if (!alarm) {
        showStatusMsg("⚠️ No daily scrape alarm exists.", true);
        console.log("⚠️ No alarm named 'dailyScrape' found.");
      } else {
        chrome.alarms.clear('dailyScrape', () => {
          // Recheck just to confirm it's gone
          chrome.alarms.get('dailyScrape', (afterClear) => {
            if (!afterClear) {
              showStatusMsg("✅ Daily scrape alarm cancelled.", false);
              console.log("✅ Alarm 'dailyScrape' cleared.");
            } else {
              showStatusMsg("❌ Failed to cancel daily scrape alarm.", true);
              console.log("❌ Alarm 'dailyScrape' still exists after attempting to clear.");
            }
          });
        });
      }
    });
  }
});

// Dev Only 

if (isDev) {
  function testMail() {
    const testData = {
      prices: {
        "Hotel A": { price: "$100", timestamp: new Date().toISOString() },
        "Hotel B": { price: "$150", timestamp: new Date().toISOString() }
      }
    };
    sendEmailRequest(testData);
  }

  // Listen for a test message to trigger email sending
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'testMail') {
      testMail();
      showStatusMsg("✅ Test email sent successfully.", false);
    }
  });
  log("🔧 Dev mode enabled: Test email functionality is active.");
}


//wrapper function for the showStatusMsg function in popup.js
// This function sends a message to the popup to show a status message
function showStatusMsg(msg, isError = false, timeout = 3000) {
  chrome.runtime.sendMessage({ action: 'showStatusMsg', msg, isError, timeout });
}

//<--------------------------------------End of background.js-------------------------------------------------->
