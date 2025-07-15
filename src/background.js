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

// Function to sign out the user
function LogoutUser() {
  signOut(auth)
    .then(() => {
      log("👋 User signed out successfully.");

      chrome.storage.local.remove(
        ['propertyLinks', 'prices', 'isPrimed', 'notificationEmail'],
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

  const config = await getScrapeConfig();

  // Wrap chrome.storage.local.get in a Promise to await it
  const result = await new Promise((resolve) => {
    chrome.storage.local.get({ backgroundTabs: true }, resolve);
  });

  const openInBackground = result.backgroundTabs;

  // Create tab and wait for it to open
  const tab = await new Promise((resolve) => {
    chrome.tabs.create({ url: urls[0], active: !openInBackground }, resolve);
  });

  try {
    for (let i = 0; i < urls.length; i++) {
      chrome.storage.local.set({
        scrapeProgress: { current: i + 1, total: urls.length },
        isScraping: true
      });

      const url = urls[i];
      if (i > 0) {
        await new Promise((resolve) => {
          chrome.tabs.update(tab.id, { url }, resolve);
        });
      }

      let delayMs = getRandomizedDelay(delay / 1000); // Convert to seconds and apply jitter
      await new Promise(r => setTimeout(r, delayMs));

      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: runScrapingScript,
          args: [config],
        });
      }
      catch (err) {
        if (err.message.includes("No tab with id")) {
          showStatusMsg("⚠️ tab closed unexpectedly.", true);
          error("⚠️ Tab closed unexpectedly while scraping:", err);
          chrome.runtime.sendMessage({ action: 'scrapingFailed', msg: "⚠️ Tab closed unexpectedly" });
          break; // Exit loop if tab is closed
        } else {
          showStatusMsg("❌ Error executing scraping script: " + err.message, true);
          error("❌ Error executing scraping script:", err);
          chrome.runtime.sendMessage({ action: 'scrapingFailed', msg: err.message });
          continue; // Skip to next URL if script fails
        }
      }
    }
  } catch (err) {
    showStatusMsg("❌ Error during scraping: " + err.message, true);
    error("❌ Error during scraping:", err);
    chrome.runtime.sendMessage({ action: 'scrapingFailed', msg: err.message });

  }
  finally {
    // Wait for tab removal before resolving
    chrome.storage.local.set({
      scrapeProgress: { current: 0, total: 0 },
      isScraping: false
    });
    await new Promise((resolve) => {
      chrome.tabs.remove(tab.id, () => {
        console.log("Tab closed after scraping all properties");
        resolve();
      });
    });
  }


}

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


//The scraping script for extracting price from HTML.
function runScrapingScript(config) {
  var getFirstMatchingElement = function (selectors, filterFn) {
    filterFn = filterFn || function () { return true; };
    for (var i = 0; i < selectors.length; i++) {
      var selector = selectors[i];
      var elements = Array.prototype.slice.call(document.querySelectorAll(selector)).filter(filterFn);
      if (elements.length > 0) return elements[0];
    }
    return null;
  };

  var price = '';

  var soldOutSelectors = config.soldOutSelectors || (config.soldOutSelector ? [config.soldOutSelector] : []);
  var soldOutElement = getFirstMatchingElement(
    soldOutSelectors,
    function (el) { return el.textContent.toLowerCase().indexOf('sold out') !== -1; }
  );

  if (soldOutElement) {
    price = 'Sold Out';
  } else {
    var keywords = (config.priceKeywords && config.priceKeywords.map(function (k) { return k.toLowerCase(); })) || ['nightly', '$'];
    var priceSelectors = config.priceSelectors || (config.priceSelector ? [config.priceSelector] : []);
    var priceElement = getFirstMatchingElement(
      priceSelectors,
      function (el) {
        var text = el.textContent.toLowerCase();
        return keywords.some(function (keyword) { return text.indexOf(keyword) !== -1; });
      }
    );

    if (priceElement) {
      price = priceElement.textContent;
      keywords.forEach(function (keyword) {
        var regex = new RegExp(keyword, 'gi');
        price = price.replace(regex, '');
      });
      price = price.trim();
    } else {
      price = 'Price not found';
    }
  }

  var params = new URLSearchParams(window.location.search);
  var hotelName = params.get('hotelName') || 'Unknown Hotel';

  console.log('💾 Stored/updated price for ' + hotelName + ':', price);
  chrome.runtime.sendMessage({ action: "storePrice", price: price, hotelName: hotelName });
}

function storePrice(hotelName, price) {
  chrome.storage.local.get({ prices: {} }, (result) => {
    const prices = result.prices;

    prices[hotelName] = {
      price,
      timestamp: new Date().toLocaleString(), // easy-to-read format
      timestamp: new Date().toLocaleString() // Store as local date string for easier readability 

      // timestamp: new Date().toISOString()  // will use this if i turn this into a price tracker
      // For now, we will store the timestamp as a local date string for easier readability 
      // will need to change the popup.js to use this format
    };

    chrome.storage.local.set({ prices }, () => {
      log(`💾 Stored/updated price for ${hotelName}:`, prices[hotelName]);
    });
  });
}



//<--------------------------------------Notification System ------------------------------------------------------>
// Function to send email request document in Firestore
async function sendEmailRequest(requestData) {
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


// <--------------------------------------Alarm System------------------------------------------------------>
// Schedule a daily scrape at a specific time and send the notification email
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'dailyScrape') {
    log('⏰ Daily scrape alarm triggered');

    try {
      await openTabsAndScrape(); // wait for scrape

      log("📧 Sending email request for scraped prices");

      const result = await new Promise((resolve) => {
        chrome.storage.local.get({ prices: {} }, resolve);
      });

      await sendEmailRequest({ prices: result.prices });

    } catch (err) {
      console.error("❌ Error during daily scrape or email:", err);
    }
  }
});


function scheduleDailyScrape(hour = 11, minute = 10) {
  chrome.storage.local.set({ dailyScrapeTime: { hour, minute } }, () => {
    log(`✅ Saved daily scrape time at ${hour}:${minute < 10 ? '0' : ''}${minute} in local storage and marked as enabled.`);
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
    showStatusMsg(`Scheduled daily scrape at ${hour}:${minute < 10 ? '0' : ''}${minute} every day.`, false);
  });
}


//wrapper function for the showStatusMsg function in popup.js
// This function sends a message to the popup to show a status message
function showStatusMsg(msg, isError = false, timeout = 3000) {
  chrome.runtime.sendMessage({ action: 'showStatusMsg', msg, isError, timeout });
}

function cancelDailyScrape() {
  chrome.alarms.get('dailyScrape', (alarm) => {
    if (!alarm) {
      showStatusMsg("⚠️ No daily scrape alarm exists.", true);
      console.log("⚠️ No alarm named 'dailyScrape' found.");
      return;
    }

    chrome.alarms.clear('dailyScrape', () => {
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
  });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'frequentScrape') {
    log('⏰ Frequent scrape alarm triggered');

    try {
      await openTabsAndScrape();
    } catch (err) {
      console.error("❌ Error during frequent scrape:", err);
    }
  }
});

function scheduleFrequentScrape(intervalInMinutes = 30) {
  chrome.alarms.clear('frequentScrape', () => {
    const when = Date.now() + intervalInMinutes * 60 * 1000;
    chrome.alarms.create('frequentScrape', { when, periodInMinutes: intervalInMinutes });
    showStatusMsg(`✅ Scheduled frequent scrape every ${intervalInMinutes} minutes.`);
  });
}

function cancelFrequentScrape() {
  chrome.alarms.get('frequentScrape', (alarm) => {
    if (!alarm) {
      showStatusMsg("⚠️ No frequent scrape alarm exists.", true);
      console.log("⚠️ No alarm named 'frequentScrape' found.");
    } else {
      chrome.alarms.clear('frequentScrape', () => {
        // Recheck just to confirm it's gone
        chrome.alarms.get('frequentScrape', (afterClear) => {
          if (!afterClear) {
            showStatusMsg("✅ Frequent scrape alarm cancelled.", false);
            console.log("✅ Alarm 'frequentScrape' cleared.");
          } else {
            showStatusMsg("❌ Failed to cancel frequent scrape alarm.", true);
            console.log("❌ Alarm 'frequentScrape' still exists after attempting to clear.");
          }
        });
      });
    }
  });
}

// <--------------------------------------Listeners------------------------------------------------------>

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'syncPropertyLinks':
      syncPropertyLinksToFirestore();
      break;
    case 'downloadPropertyLinks':
      downloadPropertyLinksFromFirestore();
      break;
    case 'loginAtStartup':
      loginAtStartup();
      break;
    case 'startGoogleOAuth':
      launchGoogleOAuth();
      break;
    case 'sendEmailRequest':
      sendEmailRequest(message.requestData);
      break;
    case 'startScraping':
      openTabsAndScrape();
      break;
    case 'logoutUser':
      LogoutUser();
      break;
    case 'scheduleDailyScrape':
      {
        const { hour, minute } = message;
        scheduleDailyScrape(hour, minute);
      }
      break;
    case 'scheduleFrequentScrape':
      {
        const { intervalInMinutes } = message;
        scheduleFrequentScrape(intervalInMinutes || 30); // Default to 30 minutes if not provided
      }
      break;
    case 'cancelDailyScrape':
      cancelDailyScrape();
      break;
    case 'cancelFrequentScrape':
      cancelFrequentScrape();
      break;
    case "storePrice":
      if (message.hotelName && message.price) {
        storePrice(message.hotelName, message.price);
      }
      break;
    default:
      warn("⚠️ Unknown action received:", message.action);
      showStatusMsg("⚠️ Unknown action: " + message.action, true);
      break;
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


//<--------------------------------------End of background.js-------------------------------------------------->
