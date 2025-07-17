// background.js
import { auth, db } from './lib/firebase';
import { getPriceHistoryIDB, savePriceHistoryIDB } from './lib/priceHistoryDB';
import {
  onAuthStateChanged, signInAnonymously,
  GoogleAuthProvider, signInWithCredential, linkWithCredential,
  signOut, onIdTokenChanged
} from 'firebase/auth/web-extension';
import { doc, setDoc, getDoc } from 'firebase/firestore';

// dev mode logging
const isDev = process.env.NODE_ENV === 'development';

const log = (...args) => isDev && console.log(...args);
const warn = (...args) => isDev && console.warn(...args);
const error = (...args) => isDev && console.error(...args);
//----------------------------------------------------------

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

// Function to log authentication state changes in chrome.storage.local
// Monitor auth state changes
onAuthStateChanged(auth, (user) => {
  const state = user?.isAnonymous ? 'anonymous' : 'google';
  chrome.storage.local.set({ authState: state }, () => {
    log(`✅ Authentication state set to ${state}`);
  });
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

onIdTokenChanged(auth, async (user) => {
  if (user) {
    log('Token refreshed:');
  }
});




// <--------------------------------------End of Firebase Setup-------------------------------------------------->


// <--------------------------------------Startup Sequence------------------------------------------------------>
function loginAtStartup() {
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


//listener for the call from popup.js to start the login process



// <------------------------------------------Scraping logic--------------------------------------------------->
let props = []; // Global variable to hold properties loaded from storage
let agent_ = 'auto'; // Default agent for scraping

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


async function openTabsAndScrape_() {
  function waitForTabComplete(tabId, timeout = 15000) {
    return new Promise((resolve, reject) => {
      let timer = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error("Timeout waiting for tab to load"));
      }, timeout);

      function listener(updatedTabId, changeInfo) {
        if (updatedTabId === tabId && changeInfo.status === "complete") {
          clearTimeout(timer);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      }

      chrome.tabs.onUpdated.addListener(listener);
    });
  }

  const startTime = Date.now();
  let anyError = false;
  const urls = generateUrls();
  if (!urls || urls.length === 0) {
    showStatusMsg("⚠️ No URLs to scrape.", true);
    return;
  }


  const delay = await new Promise(resolve =>
    chrome.storage.local.get({ pageDelay: 6 }, res => resolve(res.pageDelay * 1000))
  ); // Convert to milliseconds

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

      await waitForTabComplete(tab.id); // Wait for tab to load

      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: runScrapingScript,
          args: [config],
        });
      }
      catch (err) {
        anyError = true;
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
    anyError = true;
    showStatusMsg("❌ Error during scraping: " + err.message, true);
    error("❌ Error during scraping:", err);
    chrome.runtime.sendMessage({ action: 'scrapingFailed', msg: err.message });
  }
  finally {
    // Reset scraping state
    await new Promise((resolve) => {
      chrome.storage.local.set({
        scrapeProgress: { current: 0, total: 0 },
        isScraping: false
      }, resolve);
    });

    // Update last run time only if no errors occurred
    if (!anyError) {
      await new Promise((resolve) => {
        chrome.storage.local.set({ lastrun: new Date().toISOString() }, resolve);
      });
      log("✅ Scraping completed successfully for all properties.");
    }

    // Close the tab after scraping is complete
    await new Promise((resolve) => {
      chrome.tabs.remove(tab.id, () => {
        const endTime = Date.now();
        console.log("Tab closed after scraping all properties");
        console.log(`Total scraping time: ${endTime - startTime} ms`);
        resolve();
      });
    });
  }
}



async function openTabsAndScrape({ waitIfBusy = false, agent = 'auto' } = {}) {
  const getIsScraping = () =>
    new Promise((resolve) =>
      chrome.storage.local.get({ isScraping: false }, (res) => resolve(res.isScraping))
    );

  const setIsScraping = (value) =>
    chrome.storage.local.set({ isScraping: value });

  const lastRun = await new Promise((resolve) =>
    chrome.storage.local.get({ lastrun: null }, (result) => resolve(result.lastrun))
  );

  // Check if last run was within the last 5 minutes
  if (lastRun) {
    const minutesSince = (Date.now() - new Date(lastRun)) / 1000 / 60;
    const waittime = 0.1; // 5 minutes
    if (minutesSince < waittime) { // 5 minutes
      log(`🛑 Skipping scrape — last one was just ${minutesSince.toFixed(1)} min ago.`);
      showStatusMsg(`🛑 Skipping scrape — wait ${waittime - minutesSince.toFixed(1)} mins.`, true);
      return;
    }
  }

  if (await getIsScraping()) {
    if (waitIfBusy) {
      log("⏳ Scrape in progress, waiting...");
      while (await getIsScraping()) {
        await new Promise((r) => setTimeout(r, 1000));
      }
      log("✅ Previous scrape finished. Proceeding...");
      return 'used existing scrape';
    } else {
      warn("⚠️ Scrape already in progress. Aborting new scrape.");
      return null;
    }
  }

  try {
    await setIsScraping(true);
    agent_ = agent; // Update global agent variable for the price snapshot function
    await openTabsAndScrape_();
  } catch (err) {
    error("❌ Error inside scrape lock wrapper:", err);
    throw err;
  } finally {
    await setIsScraping(false);
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
    warn('⚠️ Using default config due to fetch error:', err);
    return defaultConfig;
  }
}


//The scraping script for extracting price from HTML.
async function runScrapingScript(config) {

  // --- Begin stealth background events simulation ---
  const events = ['focus', 'blur'];

  function fireEvent(eventType) {
    switch (eventType) {
      case 'focus': {
        const x = Math.random() * window.innerWidth;
        const y = Math.random() * window.innerHeight;
        const evt = new MouseEvent('mousemove', {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          screenX: x,
          screenY: y
        });
        document.dispatchEvent(evt);
        chrome.runtime.sendMessage({ action: 'logMessage', msg: `Fired event: Mouse Move` });
        // Simulate focus event
        window.dispatchEvent(new Event('focus', { bubbles: true }));
        chrome.runtime.sendMessage({ action: 'logMessage', msg: `Fired event: ${eventType}` });
        break;
      }
      case 'blur': {
        const x = Math.random() * window.innerWidth;
        const y = Math.random() * window.innerHeight;
        const evt = new MouseEvent('mousemove', {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          screenX: x,
          screenY: y
        });
        document.dispatchEvent(evt);
        chrome.runtime.sendMessage({ action: 'logMessage', msg: `Fired event: Mouse Move` });
        // Simulate blur event
        window.dispatchEvent(new Event('blur', { bubbles: true }));
        chrome.runtime.sendMessage({ action: 'logMessage', msg: `Fired event: ${eventType}` });
        break;
      }
    }
  }

  // Fire 2 or 3 random stealth events with delays
  const count = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < count; i++) {
    const eventType = events[Math.floor(Math.random() * events.length)];
    fireEvent(eventType);
    // Wait 0.001 sec to 0.025 sec between events
    await new Promise(r => setTimeout(r, 10 + Math.random() * 15));
  }
  // --- End stealth events simulation ---

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
  chrome.runtime.sendMessage({ action: 'logMessage', msg: `☁️ fetched price for ${hotelName}: ${price}` });
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

    addPriceSnapshot(hotelName, price, 'USD', agent_).catch(err => {
      error("❌ Error adding price snapshot:", err);
    });
  });
}
// Key used in chrome.storage.local
const STORAGE_KEY = "todaysPriceHistoryBuffer";

async function addPriceSnapshot(hotelName, price, currency = 'USD', source = 'auto') {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const priceHistory = data[STORAGE_KEY] || {};

  if (!priceHistory[hotelName]) {
    priceHistory[hotelName] = [];
  }

  priceHistory[hotelName].push({
    price,
    currency,
    source,
    timestamp: new Date().toISOString()
  });

  await chrome.storage.local.set({ [STORAGE_KEY]: priceHistory }, () => {
    log(`💾 Added price snapshot for ${hotelName}:`, { price, currency, source });
  });
}

const getPriceBuffer = () =>
  new Promise(resolve => {
    chrome.storage.local.get([STORAGE_KEY], result => {
      resolve(result[STORAGE_KEY] || {});
    });
  });

//-----------------------------------------End of Scraping logic--------------------------------------------------*/

// <--------------------------------------Data cleaning------------------------------------------------------>

// Function to group prices by day

function summarizeLatestPrices(buffer) {
  const summary = {};

  for (const hotel in buffer) {
    const entries = buffer[hotel];
    if (!entries.length) continue;

    // Extract numeric prices, ignoring invalid ones
    const prices = entries
      .map(e => parseFloat(String(e.price).replace(/[^0-9.]/g, '')))
      .filter(p => !isNaN(p));

    if (prices.length === 0) {
      prices.push(0); // If no valid prices, default to 0
      log(`⚠️ No valid prices found for ${hotel}. Defaulting to 0.`);
    }

    const openingPrice = prices[0];
    const closingPrice = prices[prices.length - 1];
    const priceRange = [Math.min(...prices), Math.max(...prices)];
    const average = prices.reduce((a, b) => a + b, 0) / prices.length;

    // Use the date portion of the earliest entry timestamp for consistency
    const dateKey = entries[0].timestamp.split('T')[0];

    summary[hotel] = {
      timestamp: dateKey,
      openingPrice,
      closingPrice,
      priceRange,
      average: Number(average.toFixed(2)),
      currency: entries[0].currency || 'USD',
      source: entries[entries.length - 1].source || 'auto'
    };
  }

  return summary;
}

// Function to sanitize hotel names for Firestore document IDs
function nameSanitizer(name) {
  return name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
}

async function pushSummaryToFirebase(summary) {
  const user = auth.currentUser;
  if (!user) throw new Error("No user logged in");

  const dateKey = new Date().toISOString().split('T')[0]; // e.g., "2025-07-15"

  for (const hotel in summary) {
    const sanitizedHotel = nameSanitizer(hotel);

    // ✅ Document path: users/<uid>/priceHistory/<sanitizedHotel>
    const docRef = doc(db, "users", user.uid, "priceHistory", sanitizedHotel);

    // ✅ summary[hotel] — NOT [Hotel] (capital H was causing undefined)
    const hotelSummary = summary[hotel];

    try {
      await setDoc(docRef, { [dateKey]: hotelSummary }, { merge: true });
      log(`✅ Pushed price summary for ${sanitizedHotel} to Firestore.`);
      showStatusMsg(`✅ Price summary for ${hotel} saved.`, false);
    } catch (err) {
      error(`❌ Failed to push price summary for ${hotel}:`, err);
      showStatusMsg(`❌ Failed to save ${hotel}: ${err.message}`, true);
      throw new Error(`Failed to push price summary for ${hotel}: ${err.message}`);
    }
  }
}


function clearPriceBuffer() {
  return chrome.storage.local.remove(STORAGE_KEY);
}

async function consolidatePriceBuffer() {
  const buffer = await getPriceBuffer();
  const summary = summarizeLatestPrices(buffer);
  await pushSummaryToFirebase(summary);
  if (!isDev) await clearPriceBuffer(); // Don't clear buffer in dev mode for testing
  log("the summary of latest prices:", summary);
  log("✅ Consolidated to Firebase and cleared local buffer.");
}

async function fetchPriceHistoryfromFirebase(hotelName) {
  const user = auth.currentUser;
  if (!user) throw new Error("No user logged in");

  const sanitizedHotel = nameSanitizer(hotelName);
  const docRef = doc(db, "users", user.uid, "priceHistory", sanitizedHotel);

  return getDoc(docRef).then((doc) => {
    if (!doc.exists()) {
      log(`⚠️ No price history found for ${hotelName}`);
      return null;
    }
    return doc.data();
  });
}

//idb caller function to fetch and store price history
async function fetchAndStorePriceHistory(hotelName) {
  log(`Fetching price history for ${hotelName}...`);
  try {
    const data = await fetchPriceHistoryfromFirebase(hotelName);
    if (!data) {
      log(`⚠️ No price history found for ${hotelName}`);
      return null;
    }
    await savePriceHistoryIDB(hotelName, data);
  }
  catch (err) {
    error(`❌ Error fetching or storing price history for ${hotelName}:`, err);
  }
}

async function getPriceHistory(hotelName) {
  log(`Fetching price history for ${hotelName}...`);

  try {
    // 1. Try from IDB first
    const localHistory = await getPriceHistoryIDB(hotelName);
    if (localHistory) {
      log(`✅ Fetched from IDB:`, localHistory);
      chrome.runtime.sendMessage({ action: "priceHistoryFetched", hotelName, history: localHistory });
      return localHistory;
    }

    // 2. Try from Firebase if IDB empty
    log(`⚠️ No data in IDB, trying Firebase...`);
    await fetchAndStorePriceHistory(hotelName);

    const newHistory = await getPriceHistoryIDB(hotelName);
    if (newHistory) {
      log(`✅ Fetched from Firebase (now in IDB):`, newHistory);
      chrome.runtime.sendMessage({ action: "priceHistoryFetched", hotelName, history: newHistory });
      return newHistory;
    } else {
      log(`❌ Still no data after Firebase fetch.`);
      chrome.runtime.sendMessage({ action: "noPriceHistory", hotelName, history: null });
      return null;
    }
  } catch (err) {
    log(`🔥 Error fetching price history for ${hotelName}:`, err);
    chrome.runtime.sendMessage({ action: "noPriceHistory", hotelName, history: null });
    return null;
  }
}

//--------------------------------------Notification System ------------------------------------------------------*/
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
      const message = await openTabsAndScrape({ waitIfBusy: true, agent: 'auto' }); // wait for scrape
      if (message === 'used existing scrape') {
        log("✅ Using existing scrape data.");
      } else {
        log("✅ Scrape completed successfully.");
      }
      log("📧 Sending email request for scraped prices");

      const result = await new Promise((resolve) => {
        chrome.storage.local.get({ prices: {} }, resolve);
      });

      await sendEmailRequest({ prices: result.prices });

    } catch (err) {
      error("❌ Error during daily scrape or email:", err);
    }
  }
  else if (alarm.name === 'frequentScrape') {
    log('⏰ Frequent scrape alarm triggered');
    try {
      await openTabsAndScrape({ agent: 'auto' });
    } catch (err) {
      error("❌ Error during frequent scrape:", err);
    }
  }
  else if (alarm.name === 'dailySync') {
    log('⏰ Daily sync alarm triggered');
    try {
      await consolidatePriceBuffer(); //consolidate prices and push to Firebase for price history
      log("✅ Daily sync completed successfully.");
    } catch (err) {
      error("❌ Error during daily sync:", err);
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
    chrome.storage.local.set({ dailyScrapeEnabled: true });
    log(`Scheduled daily scrape alarm at ${hour}:${minute < 10 ? '0' : ''}${minute}`);
    showStatusMsg(`Scheduled daily scrape at ${hour}:${minute < 10 ? '0' : ''}${minute} every day.`, false);
  });
}


//cancel the daily scrape alarm
function cancelDailyScrape() {
  chrome.alarms.get('dailyScrape', (alarm) => {
    if (!alarm) {
      showStatusMsg("⚠️ No daily scrape alarm exists.", true);
      log("⚠️ No alarm named 'dailyScrape' found.");
      return;
    }

    chrome.alarms.clear('dailyScrape', () => {
      chrome.alarms.get('dailyScrape', (afterClear) => {
        if (!afterClear) {
          showStatusMsg("✅ Daily scrape alarm cancelled.", false);
          log("✅ Alarm 'dailyScrape' cleared.");
          chrome.storage.local.set({ dailyScrapeEnabled: false });
        } else {
          showStatusMsg("❌ Failed to cancel daily scrape alarm.", true);
          log("❌ Alarm 'dailyScrape' still exists after attempting to clear.");
        }
      });
    });
  });
}

function scheduleFrequentScrape(intervalInMinutes = 30) {
  chrome.alarms.clear('frequentScrape', () => {
    const when = Date.now() + intervalInMinutes * 60 * 1000;
    chrome.alarms.create('frequentScrape', { when, periodInMinutes: intervalInMinutes });
    chrome.storage.local.set({ frequentScrapeInterval: intervalInMinutes, frequentScrapeEnabled: true }, () => {
      log(`✅ Scheduled frequent scrape every ${intervalInMinutes} minutes.`);
    });
    showStatusMsg(`✅ Scheduled frequent scrape every ${intervalInMinutes} minutes.`);
    scheduleDailySync(); // Ensure daily sync is scheduled
  });
}

// Function to cancel the frequent scrape alarm and also clear the daily sync alarm if no data exists no need to sync.
function cancelFrequentScrape() {
  chrome.alarms.get('frequentScrape', (alarm) => {
    if (!alarm) {
      showStatusMsg("⚠️ No frequent scrape alarm exists.", true);
      log("⚠️ No alarm named 'frequentScrape' found.");
      return;
    }
    chrome.alarms.clear('frequentScrape', () => {
      // Recheck just to confirm it's gone
      chrome.alarms.get('frequentScrape', (afterClear) => {
        if (!afterClear) {
          showStatusMsg("✅ Frequent scrape alarm cancelled.", false);
          log("✅ Alarm 'frequentScrape' cleared.");
          chrome.storage.local.set({ frequentScrapeInterval: null, frequentScrapeEnabled: false });
        } else {
          showStatusMsg("❌ Failed to cancel frequent scrape alarm.", true);
          log("❌ Alarm 'frequentScrape' still exists after attempting to clear.");
        }
      });
    });

    //clear dailysync alarm too
    chrome.alarms.clear('dailySync', (wasCleared) => {
      if (wasCleared) {
        showStatusMsg("✅ Daily sync alarm cleared.", false);
        log("✅ Daily sync alarm cleared.");
      } else {
        showStatusMsg("⚠️ No daily sync alarm existed.", true);
        log("⚠️ Daily sync alarm did not exist.");
      }
    });
  });
}

function scheduleDailySync(hour = 23, minute = 30) {
  const now = new Date();
  const next = new Date();

  next.setHours(hour, minute, 0, 0); // target sync time
  if (next <= now) {
    next.setDate(next.getDate() + 1); // move to next day if time passed
  }

  const delayInMinutes = (next - now) / 60000;

  chrome.alarms.create("dailySync", {
    delayInMinutes,
    periodInMinutes: 1440 // 24 hours
  });

  log(`⏰ Scheduled daily sync in ${delayInMinutes.toFixed(2)} mins`);
}

// <--------------------------------------Listeners------------------------------------------------------>

//calibrate the daily sync alarm on install and startup
chrome.runtime.onInstalled.addListener(() => {
  scheduleFrequentScrape(); //this will also set the daily sync alarm
  scheduleDailyScrape(); // Default to 11:10 AM
  loginAtStartup(); // Ensure user is logged in at startup
  log("🔧 Extension installed. Scheduled daily scrape at 11:10 AM and frequent scrape every 30 minutes.");
});

chrome.runtime.onStartup.addListener(() => {
  loginAtStartup(); // Ensure user is logged in at startup
  chrome.storage.local.get(
    ['frequentScrapeEnabled', 'frequentScrapeInterval', 'dailyScrapeEnabled', 'dailyScrapeTime'],
    (result) => {
      if (result.frequentScrapeEnabled) {
        const interval = parseInt(result.frequentScrapeInterval, 10);
        if (!isNaN(interval) && interval > 0) {
          scheduleFrequentScrape(interval);
        } else {
          warn("⚠️ Invalid or missing frequentScrapeInterval. Skipping scheduling.");
        }
      }

      if (result.dailyScrapeEnabled) {
        const time = result.dailyScrapeTime || { hour: 11, minute: 10 };
        const hour = parseInt(time.hour, 10);
        const minute = parseInt(time.minute, 10);

        if (!isNaN(hour) && !isNaN(minute)) {
          scheduleDailyScrape(hour, minute);
        } else {
          warn("⚠️ Invalid dailyScrapeTime. Skipping daily scrape scheduling.");
        }
      }
    }
  );
  log("🔧 Extension started. Checked and scheduled daily and frequent scrapes based on stored settings.");
});


// Listen for messages from popup.js or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'syncPropertyLinks':
      syncPropertyLinksToFirestore();
      break;
    case 'downloadPropertyLinks':
      downloadPropertyLinksFromFirestore();
      break;
    case 'loginAtStartup': // mostly redundant, but left for now.
      loginAtStartup();
      break;
    case 'startGoogleOAuth':
      launchGoogleOAuth();
      break;
    case 'sendEmailRequest':
      sendEmailRequest(message.requestData);
      break;
    case 'startScraping':
      openTabsAndScrape({ agent: 'manual' });
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
        const intervalInMinutes = parseInt(message.frequency, 10);
        scheduleFrequentScrape(intervalInMinutes);
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
    case 'openDashboard':
      chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
      break;
    case 'getPriceHistory':
      getPriceHistory(message.hotelName);
      break;
    case 'logMessage':
      log("🔧 External log:", message.msg);
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

    if (message.action === 'getSummaryPrices') {
      log("🔧 Fetched price history:", priceHistory);
      consolidatePriceBuffer();
      showStatusMsg("✅ Test price summary consolidated.", false);
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
