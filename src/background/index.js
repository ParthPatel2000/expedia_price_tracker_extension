//background.js
import { getPriceHistoryIDB, savePriceHistoryIDB } from '../lib/priceHistoryDB.js';
import { openTabsAndScrape } from './scraper.js';
import { consolidatePriceBuffer } from './monthlyHistory.js';
import { syncPropertyLinksToFirestore, downloadPropertyLinksFromFirestore } from './propertyLinks.js';
import { loginAtStartup, launchGoogleOAuth, LogoutUser } from './firebase_utils.js';
import { storePrice, getTodaysPriceHistory } from './priceStorage.js';
import { getPriceHistory } from './monthlyHistory.js';
import {
  scheduleFrequentScrape, cancelFrequentScrape,
  scheduleDailyScrape, cancelDailyScrape,
  handleDailyScrape, handleFrequentScrape, handleDailySync
} from './alarmScheduling.js';
import { sendEmailRequest } from './emailNotification.js';


//<--------------------------------------Logger------------------------------------------------------>
// dev mode logging
export const isDev = process.env.NODE_ENV === 'development';

export const log = (...args) => isDev && console.log(...args);
export const warn = (...args) => isDev && console.warn(...args);
export const error = (...args) => isDev && console.error(...args);

export function showStatusMsg(msg, isError = false, timeout = 3000) {
  chrome.runtime.sendMessage({ action: 'showStatusMsg', msg, isError, timeout });
}

// <--------------------------------------Listeners------------------------------------------------------>

function initializeExtensionAlarms() {
  log("🔧 Initializing alarms...");
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
  log("🔧 Alarms initialized based on stored Settings");
}


//calibrate the daily sync alarm on install and startup
chrome.runtime.onInstalled.addListener(() => {
  scheduleFrequentScrape(); //this will also set the daily sync alarm
  scheduleDailyScrape(); // Default to 11:10 AM
  loginAtStartup(); // Ensure user is logged in at startup
  chrome.storage.local.set({ isScraping: false, scrapeProgress: { "current": 0, "total": 0 } }); // Reset scraping state on install
  log("🔧 Extension installed. Scheduled daily scrape at 11:10 AM and frequent scrape every 30 minutes.");

});

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.set({ isScraping: false, scrapeProgress: { "current": 0, "total": 0 } }); // Reset scraping state on startup
  loginAtStartup(); // Ensure user is logged in at startup
  initializeExtensionAlarms(); // Reinitialize alarms on startup
});

// Listen for alarms and handle them accordingly
chrome.alarms.onAlarm.addListener(async (alarm) => {
  switch (alarm.name) {
    case 'frequentScrape':
      log('⏰ Frequent scrape alarm triggered');
      await handleFrequentScrape();
      break;
    case 'dailyScrape':
      log('⏰ Daily scrape alarm triggered');
      await handleDailyScrape();
      break;
    case 'dailySync':
      log('⏰ Daily sync alarm triggered');
      await handleDailySync();
      break;
  }
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
    case 'getTodaysPriceHistory':
      getTodaysPriceHistory(message.hotelName);
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





//<--------------------------------------End of background.js-------------------------------------------------->
