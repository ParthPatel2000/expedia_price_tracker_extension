import { log, warn, error, showStatusMsg, isDev } from './index.js'; // Import logging and status functions

/**
 * Generates a list of URLs with updated check-in and check-out dates based on the current and next day.
 *
 * @function
 * @returns {string[]} An array of URLs with the "d1", "startDate", "d2", and "endDate" query 
 * parameters set to today's and tomorrow's dates.
 *
 * @dependsOn {Array<{url: string}>} props - The function expects a variable `props` in scope, 
 * which should be an array of objects each containing a `url` property.
 */
async function generateUrls() {

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

  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86400000);
  const checkIn = formatDate(today);
  const checkOut = formatDate(tomorrow);

  const result = await new Promise(resolve => chrome.storage.local.get("propertyLinks", resolve));
  const props = Array.isArray(result.propertyLinks) ? result.propertyLinks : [];

  if (props.length === 0) {
    warn("⚠️ No property links found. Returning empty URL list.");
    return [];
  }

  return props.map(p => updateUrlWithDates(p.url, checkIn, checkOut));
}

/**
 * Opens a browser tab and sequentially scrapes a list of URLs, handling
 * bot detection, tab loading, and error reporting. Progress and state are
 * tracked in chrome.storage.local, and status updates are sent via
 * chrome.runtime messaging.
 *
 * Features:
 * - Opens a single tab (background or foreground) and navigates through
 *   multiple URLs for scraping.
 * - Waits for each page to fully load or times out after a configurable
 *   period.
 * - Detects bot/captcha pages by checking the document title for keywords.
 * - Executes a scraping script on each page, passing in a config object.
 * - Handles errors gracefully, reporting them and updating progress.
 * - Cleans up by closing the tab and resetting state after completion.
 *
 * Local Storage Fields Changed:
 * - `scrapeProgress`: { current: number, total: number }
 *   Updated before each URL scrape and reset after completion.
 * - `isScraping`: boolean
 *   Set to true during scraping, reset to false after completion.
 * - `detectedBot`: boolean
 *   Set to true if bot detection is triggered.
 * - `lastRun`: string (ISO date)
 *   Set after successful completion of all scrapes.
 *
 * Chrome Messages Sent:
 * - `{ type: "scrape_failed", reason: "bot_detected", url }`
 *   Sent if bot detection is triggered on a page.
 * - `{ action: "scrapingFailed", msg }`
 *   Sent on various scraping or script execution errors.
 *
 * Dependencies:
 * - `generateUrls()`: Function to generate the list of URLs to scrape.
 * - `getScrapeConfig()`: Function to retrieve scraping configuration.
 * - `runScrapingScript`: Function injected into the tab to perform scraping.
 * - `showStatusMsg()`, `log()`, `error()`: Utility functions for status
 *   and logging.
 */
async function openTabsAndScrape_() {

  function checkForBotDetection(tabId) {
    return chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const title = document.title.toLowerCase();
        const keywords = ["bot", "robot", "verify", "captcha", "access denied"];
        return keywords.some(keyword => title.includes(keyword));
      }
    }).then(results => results[0]?.result === true);
  }


  // Function to wait for a tab to complete loading or timeout 30 secs
  function waitForTabComplete(tabId, timeout = 30000) {
    return new Promise((resolve) => {
      let resolved = false;

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          console.warn(`[${new Date().toISOString()}] ⏰ Timeout in waitForTabComplete (tab ${tabId})`);
          resolve("timeout");
        }
      }, timeout);

      function handleUpdated(updatedTabId, changeInfo) {
        if (updatedTabId === tabId && changeInfo.status === "complete") {
          if (!resolved) {
            resolved = true;
            cleanup();
            log(`[${new Date().toISOString()}] ✅ Tab ${tabId} loaded`);
            resolve("complete");
          }
        }
      }

      function handleRemoved(closedTabId) {
        if (closedTabId === tabId && !resolved) {
          resolved = true;
          cleanup();
          console.warn(`[${new Date().toISOString()}] ❌ Tab ${tabId} closed`);
          resolve("closed");
        }
      }

      function cleanup() {
        try {
          chrome.tabs.onUpdated.removeListener(handleUpdated);
          chrome.tabs.onRemoved.removeListener(handleRemoved);
          clearTimeout(timer);
        } catch (e) {
          console.error("Cleanup error:", e);
        }
      }

      // Safety net: Periodically check tab status
      const interval = setInterval(() => {
        chrome.tabs.get(tabId, tab => {
          if (chrome.runtime.lastError || !tab) {
            if (!resolved) {
              resolved = true;
              clearInterval(interval);
              cleanup();
              console.warn(`[${new Date().toISOString()}] 🛑 Tab ${tabId} not found (maybe closed/crashed)`);
              resolve("closed");
            }
          }
        });
      }, 5000);

      chrome.tabs.onUpdated.addListener(handleUpdated);
      chrome.tabs.onRemoved.addListener(handleRemoved);
    });
  }


  const startTime = Date.now();
  let anyError = false;
  const urls = await generateUrls();
  if (!urls || urls.length === 0) {
    showStatusMsg("⚠️ No URLs to scrape.", true);
    return;
  }


  const timeout = await new Promise(resolve =>
    chrome.storage.local.get({ timeout: 30000 }, res => resolve(res.timeout * 1000))
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

      const resolve_text = await waitForTabComplete(tab.id, timeout); // Wait for tab to load
      log(`wait resolved via: ${resolve_text}`);

      const isbotDetected = await checkForBotDetection(tab.id);
      if (isbotDetected) {
        chrome.runtime.sendMessage({
          type: "scrape_failed",
          reason: "bot_detected",
          url: url
        });
        chrome.storage.local.set({ 'detectedBot': true });
        anyError = true;
        return; // Stop further scraping
      }

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
        chrome.storage.local.set({ lastRun: Date.now() }, resolve);
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


/**
 * Wrapper for openTabsAndScrape_(), with concurrency and cooldown control.
 *
 * Features:
 * - Prevents concurrent scrapes using a local storage lock (`isScraping`).
 * - Enforces a cooldown period between scrapes using `lastRun` in local storage.
 * - Optionally waits for an ongoing scrape to finish (`waitIfBusy`).
 * - Updates a global `agent_` variable for downstream scraping logic.
 * - Calls `openTabsAndScrape_()` to perform the actual scraping.
 * - Logs and displays status messages to the user.
 *
 * @async
 * @param {Object} [options={}] - Options for scraping.
 * @param {boolean} [options.waitIfBusy=false] - Wait for ongoing scrape if true.
 * @param {string} [options.agent='auto'] - User agent to use for scraping.
 * @returns {Promise<string|null|undefined>} Resolves when scraping is done,
 *   or returns 'used existing scrape' if waited for another scrape,
 *   or null if aborted due to an ongoing scrape.
 *
 * @localstorage
 * - `isScraping`: boolean, set to true at start and false at end of scrape.
 * - `lastRun`: timestamp, checked to enforce cooldown between scrapes.
 *
 * @dependencies
 * - Uses `chrome.storage.local` for state management.
 * - Relies on global functions: `log`, `warn`, `error`, `showStatusMsg`.
 * - Uses global variable: `agent_`.
 * - Calls `openTabsAndScrape_()` for actual scraping logic.
 */
export async function openTabsAndScrape({ waitIfBusy = false, agent = 'auto' } = {}) {
  const getIsScraping = () =>
    new Promise((resolve) =>
      chrome.storage.local.get({ isScraping: false }, (res) => resolve(res.isScraping))
    );

  const setIsScraping = (value) =>
    chrome.storage.local.set({ isScraping: value });

  const lastRun = await new Promise((resolve) =>
    chrome.storage.local.get({ lastRun: null }, (result) => resolve(result.lastRun))
  );

  // Check if last run was within the last 5 minutes
  if (lastRun) {
    const minutesSince = (Date.now() - new Date(lastRun)) / 1000 / 60;
    const waittime = isDev ? 0.1 : 5; // 5 minutes
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
    chrome.storage.local.set({ agent });
    await openTabsAndScrape_();
  } catch (err) {
    error("❌ Error inside scrape lock wrapper:", err);
    throw err;
  } finally {
    await setIsScraping(false);
  }
}


/**
 * Fetches the scraping configuration from a remote URL. If the fetch fails,
 * returns a default configuration. Logs the result using `log` or `warn`.
 *
 * Features:
 * - Attempts to fetch config from a remote JSON endpoint.
 * - Falls back to a default config on network or parsing errors.
 * - Logs success or failure using `log` and `warn` functions.
 *
 * Dependencies:
 * - Requires `fetch` API for HTTP requests.
 * - Uses `log` and `warn` functions for logging.
 *
 * @async
 * @function getScrapeConfig
 * @returns {Promise<Object>} The scraping configuration object.
 */
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


/**
 * Runs a scraping script to extract price information from the current page.
 * 
 * Features:
 * - Simulates stealth user events (focus, blur, mousemove) to evade bot
 *   detection.
 * - Searches for "sold out" indicators using configurable selectors and
 *   keywords.
 * - Extracts price information using configurable selectors and keywords,
 *   removing keyword text from the result.
 * - Sends extracted price and hotel name to the background script.
 * 
 * @async
 * @function runScrapingScript
 * @param {Object} config - Configuration object for scraping.
 * @param {string[]} [config.soldOutSelectors] - CSS selectors for sold out
 *   elements.
 * @param {string} [config.soldOutSelector] - Single sold out selector.
 * @param {string[]} [config.soldOutKeywords] - Keywords indicating sold out.
 * @param {string[]} [config.priceSelectors] - CSS selectors for price elements.
 * @param {string} [config.priceSelector] - Single price selector.
 * @param {string[]} [config.priceKeywords] - Keywords to identify price text.
 * 
 * @chromeMessage {action: 'logMessage', msg: string}
 *   - Logs events and scraping results to the background script.
 * @chromeMessage {action: 'storePrice', price: string, hotelName: string}
 *   - Stores the scraped price and hotel name.
 * 
 * @dependencies
 * - Requires Chrome extension APIs (chrome.runtime.sendMessage).
 * - Relies on DOM access and window.location for scraping.
 * 
 * @localStorage
 * - None directly modified; price data is sent via chrome messages.
 */

// async function runScrapingScript(config) {
//   // --- Begin stealth background events simulation ---
//   const events = ['focus', 'blur'];

//   function fireEvent(eventType) {
//     switch (eventType) {
//       case 'focus': {
//         const x = Math.random() * window.innerWidth;
//         const y = Math.random() * window.innerHeight;
//         const evt = new MouseEvent('mousemove', {
//           bubbles: true,
//           cancelable: true,
//           clientX: x,
//           clientY: y,
//           screenX: x,
//           screenY: y
//         });
//         document.dispatchEvent(evt);
//         chrome.runtime.sendMessage({ action: 'logMessage', msg: `Fired event: Mouse Move` });
//         // Simulate focus event
//         window.dispatchEvent(new Event('focus', { bubbles: true }));
//         chrome.runtime.sendMessage({ action: 'logMessage', msg: `Fired event: ${eventType}` });
//         break;
//       }
//       case 'blur': {
//         const x = Math.random() * window.innerWidth;
//         const y = Math.random() * window.innerHeight;
//         const evt = new MouseEvent('mousemove', {
//           bubbles: true,
//           cancelable: true,
//           clientX: x,
//           clientY: y,
//           screenX: x,
//           screenY: y
//         });
//         document.dispatchEvent(evt);
//         chrome.runtime.sendMessage({ action: 'logMessage', msg: `Fired event: Mouse Move` });
//         // Simulate blur event
//         window.dispatchEvent(new Event('blur', { bubbles: true }));
//         chrome.runtime.sendMessage({ action: 'logMessage', msg: `Fired event: ${eventType}` });
//         break;
//       }
//     }
//   }

//   // Fire 2 or 3 random stealth events with delays
//   const count = 2 + Math.floor(Math.random() * 2);
//   for (let i = 0; i < count; i++) {
//     const eventType = events[Math.floor(Math.random() * events.length)];
//     fireEvent(eventType);
//     // Wait 0.01 sec to 0.25 sec between events
//     await new Promise(r => setTimeout(r, 10 + Math.random() * 15));
//   }
//   // --- End stealth events simulation ---

//   var getFirstMatchingElement = function (selectors, filterFn) {
//     filterFn = filterFn || function () { return true; };
//     for (var i = 0; i < selectors.length; i++) {
//       var selector = selectors[i];
//       var elements = Array.prototype.slice.call(document.querySelectorAll(selector)).filter(filterFn);
//       if (elements.length > 0) return elements[0];
//     }
//     return null;
//   };

//   var price = '';

//   var soldOutSelectors = config.soldOutSelectors || (config.soldOutSelector ? [config.soldOutSelector] : []);

//   var soldOutKeywords = (config.soldOutKeywords || ['sold out']).map(k => k.toLowerCase());

//   var soldOutElement = getFirstMatchingElement(
//     soldOutSelectors,
//     function (el) {
//       const text = el.textContent.toLowerCase();
//       return soldOutKeywords.some(keyword => text.includes(keyword));
//     }
//   );


//   if (soldOutElement) {
//     price = 'N/A ';
//   } else {
//     var keywords = (config.priceKeywords && config.priceKeywords.map(function (k) { return k.toLowerCase(); })) || ['nightly', '$'];
//     var priceSelectors = config.priceSelectors || (config.priceSelector ? [config.priceSelector] : []);
//     var priceElement = getFirstMatchingElement(
//       priceSelectors,
//       function (el) {
//         var text = el.textContent.toLowerCase();
//         return keywords.some(function (keyword) { return text.indexOf(keyword) !== -1; });
//       }
//     );

//     if (priceElement) {

//       function escapeRegExp(string) {
//         return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
//       }

//       price = priceElement.textContent;
//       keywords.forEach(function (keyword) {
//         var escapedKeyword = escapeRegExp(keyword);
//         var regex = new RegExp(escapedKeyword, 'gi');
//         price = price.replace(regex, '');
//       });
//       price = price.trim();
//     } else {
//       price = 'N/A';
//     }
//   }

//   var params = new URLSearchParams(window.location.search);
//   var hotelName = params.get('hotelName') || 'Unknown Hotel';
//   chrome.runtime.sendMessage({ action: 'logMessage', msg: `☁️ fetched price for ${hotelName}: ${price}` });
//   chrome.runtime.sendMessage({ action: "storePrice", price: price, hotelName: hotelName });
// }

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
    // Wait 0.1 sec to 0.25 sec between events
    await new Promise(r => setTimeout(r, 100 + Math.random() * 150));
  }
  // --- End stealth events simulation ---

  // Modified function to search within a specific parent element
  var getFirstMatchingElement = function (selectors, filterFn, parentElement) {
    filterFn = filterFn || function () { return true; };
    const searchContext = parentElement || document;

    for (var i = 0; i < selectors.length; i++) {
      var selector = selectors[i];
      var elements = Array.prototype.slice.call(searchContext.querySelectorAll(selector)).filter(filterFn);
      if (elements.length > 0) return elements[0];
    }
    return null;
  };

  var price = '';

  // First find the unique reference header with "Continue with your booking"
  var uniqueDivSelector = config.uniqueDivSelector || 'header.uitk-card-featured-header';
  var uniqueDiv = document.querySelector(uniqueDivSelector);

  // Alternative approach: find by the text content if the class selector doesn't work
  if (!uniqueDiv) {
    var headers = document.querySelectorAll('header');
    for (var i = 0; i < headers.length; i++) {
      if (headers[i].textContent && headers[i].textContent.includes('Continue with your booking')) {
        uniqueDiv = headers[i];
        break;
      }
    }
  }

  if (uniqueDiv) {
    chrome.runtime.sendMessage({ action: 'logMessage', msg: `Found "Continue with your booking" header` });

    // Method 1: Search in the next sibling div
    var targetDiv = uniqueDiv.nextElementSibling;

    // Method 2: Alternative - search in parent's next sibling if direct sibling doesn't work
    if (!targetDiv && uniqueDiv.parentElement) {
      targetDiv = uniqueDiv.parentElement.nextElementSibling;
    }

    if (targetDiv) {
      chrome.runtime.sendMessage({ action: 'logMessage', msg: `Found target div for price search` });

      // Check for sold out in the target div
      var soldOutSelectors = config.soldOutSelectors || (config.soldOutSelector ? [config.soldOutSelector] : []);
      var soldOutKeywords = (config.soldOutKeywords || ['sold out']).map(k => k.toLowerCase());

      var soldOutElement = getFirstMatchingElement(
        soldOutSelectors,
        function (el) {
          const text = el.textContent.toLowerCase();
          return soldOutKeywords.some(keyword => text.includes(keyword));
        },
        targetDiv  // Search only within the target div
      );

      if (soldOutElement) {
        price = 'N/A ';
      } else {
        // Search for price within the target div
        var keywords = (config.priceKeywords && config.priceKeywords.map(function (k) { return k.toLowerCase(); })) || ['nightly', '$'];
        var priceSelectors = config.priceSelectors || (config.priceSelector ? [config.priceSelector] : []);
        var priceElement = getFirstMatchingElement(
          priceSelectors,
          function (el) {
            var text = el.textContent.toLowerCase();
            return keywords.some(function (keyword) { return text.indexOf(keyword) !== -1; });
          },
          targetDiv  // Search only within the target div
        );

        if (priceElement) {
          function escapeRegExp(string) {
            return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          }

          price = priceElement.textContent;
          keywords.forEach(function (keyword) {
            var escapedKeyword = escapeRegExp(keyword);
            var regex = new RegExp(escapedKeyword, 'gi');
            price = price.replace(regex, '');
          });
          price = price.trim();
        } else {
          price = 'N/A';
        }
      }
    } else {
      chrome.runtime.sendMessage({ action: 'logMessage', msg: `Could not find target div below unique div` });
      price = 'N/A';
    }
  } else {
    chrome.runtime.sendMessage({ action: 'logMessage', msg: `Could not find "Continue with your booking" header, falling back to full page search` });

    // Fallback to original logic if unique div not found
    var soldOutSelectors = config.soldOutSelectors || (config.soldOutSelector ? [config.soldOutSelector] : []);
    var soldOutKeywords = (config.soldOutKeywords || ['sold out']).map(k => k.toLowerCase());

    var soldOutElement = getFirstMatchingElement(
      soldOutSelectors,
      function (el) {
        const text = el.textContent.toLowerCase();
        return soldOutKeywords.some(keyword => text.includes(keyword));
      }
    );

    if (soldOutElement) {
      price = 'N/A ';
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
        function escapeRegExp(string) {
          return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }

        price = priceElement.textContent;
        keywords.forEach(function (keyword) {
          var escapedKeyword = escapeRegExp(keyword);
          var regex = new RegExp(escapedKeyword, 'gi');
          price = price.replace(regex, '');
        });
        price = price.trim();
      } else {
        price = 'N/A';
      }
    }
  }

  var params = new URLSearchParams(window.location.search);
  var hotelName = params.get('hotelName') || 'Unknown Hotel';
  chrome.runtime.sendMessage({ action: 'logMessage', msg: `☁️ fetched price for ${hotelName}: ${price}` });
  chrome.runtime.sendMessage({ action: "storePrice", price: price, hotelName: hotelName });
}