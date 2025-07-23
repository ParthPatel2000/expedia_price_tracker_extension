import { log, error, showStatusMsg } from './index.js';
import { openTabsAndScrape } from './scraper.js';
import { consolidatePriceBuffer } from './monthlyHistory.js';
import { sendEmailRequest } from './emailNotification.js';




/**
 * Schedules a daily scrape at the specified hour and minute.
 *
 * - Updates local storage fields:
 *   - `dailyScrapeTime`: Set to `{ hour, minute }` when called.
 *   - `dailyScrapeEnabled`: Set to `true` after scheduling.
 * - Sends chrome messages:
 *   - Uses `chrome.alarms.create` to schedule the 'dailyScrape' alarm.
 *   - Uses `chrome.alarms.clear` to remove any existing 'dailyScrape' alarm.
 * - Dependencies:
 *   - Requires `chrome.storage.local` and `chrome.alarms` permissions.
 *   - Uses `log` and `showStatusMsg` helper functions for status updates.
 *
 * @param {number} [hour=11] - The hour (0-23) to schedule the daily scrape.
 * @param {number} [minute=10] - The minute (0-59) to schedule the daily scrape.
 */
export function scheduleDailyScrape(hour = 11, minute = 10) {
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
/**
 * Cancels the 'dailyScrape' Chrome alarm if it exists.
 *
 * - Updates local storage field `dailyScrapeEnabled` to `false` after
 *   successful cancellation.
 * - Sends status messages via `showStatusMsg`:
 *   - "⚠️ No daily scrape alarm exists." if alarm is not found.
 *   - "✅ Daily scrape alarm cancelled." if alarm is cleared.
 *   - "❌ Failed to cancel daily scrape alarm." if clearing fails.
 * - Logs actions using the `log` function.
 * - Depends on Chrome extension APIs: `chrome.alarms` and
 *   `chrome.storage.local`.
 * - Depends on helper functions: `showStatusMsg` and `log`.
 */
export function cancelDailyScrape() {
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

/**
 * Schedules a frequent scraping task using Chrome alarms.
 *
 * @function
 * @param {number} [intervalInMinutes=30] - The interval in minutes for the
 *   scraping task.
 *
 * @localstorage
 *   - frequentScrapeInterval: Set to the interval in minutes when scheduled.
 *   - frequentScrapeEnabled: Set to true when scheduling is enabled.
 *
 * @chrome
 *   - Uses chrome.alarms to schedule and clear alarms named 'frequentScrape'.
 *   - Uses chrome.storage.local to persist scheduling state.
 *
 * @messages
 *   - Sends a status message via showStatusMsg indicating scheduling.
 *
 * @dependencies
 *   - log: Function to log scheduling status.
 *   - showStatusMsg: Function to display status messages.
 *   - scheduleDailySync: Ensures daily sync is scheduled after setup.
 */
export function scheduleFrequentScrape(intervalInMinutes = 30) {
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
/**
 * Cancels the 'frequentScrape' Chrome alarm if it exists, and also clears the
 * 'dailySync' alarm. Updates local storage fields:
 *   - frequentScrapeInterval: set to null when 'frequentScrape' is cancelled
 *   - frequentScrapeEnabled: set to false when 'frequentScrape' is cancelled
 * Sends status messages using showStatusMsg() and logs actions with log().
 * Dependencies:
 *   - chrome.alarms API for alarm management
 *   - chrome.storage.local for updating scrape settings
 *   - showStatusMsg(message, isError) for user notifications
 *   - log(message) for logging actions
 */
export function cancelFrequentScrape() {
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

/**
 * Schedules a Chrome alarm to trigger a daily sync at the specified time.
 *
 * @function
 * @param {number} [hour=23] - The hour (0-23) for the daily sync.
 * @param {number} [minute=30] - The minute (0-59) for the daily sync.
 * @description
 *   Creates a Chrome alarm named "dailySync" that fires at the next
 *   occurrence of the specified hour and minute, then repeats every 24 hours.
 *   Logs the scheduled delay to the console.
 *
 * @dependencies
 *   - Uses the Chrome Alarms API: chrome.alarms.create
 *   - Relies on a global `log` function for logging.
 */
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

export async function handleDailyScrape() {
  try {
    const message = await openTabsAndScrape({ waitIfBusy: true, agent: 'auto' }); // wait for scrape
    if (message === 'used existing scrape') {
      log("✅ Using existing scrape data.");
    } else {
      log("✅ Scrape completed successfully.");
    }
    log("📧 Sending email request for scraped prices");

    const result = await chrome.storage.local.get({ prices: {} });

    await sendEmailRequest({ prices: result.prices });

  } catch (err) {
    error("❌ Error during daily scrape or email:", err);
  }
}

export async function handleFrequentScrape() {
  try {
    await openTabsAndScrape({ agent: 'auto' });
  } catch (err) {
    error("❌ Error during frequent scrape:", err);
  }
  return "Frequent scrape completed";
}

export async function handleDailySync() {
  try {
    await consolidatePriceBuffer(); // Consolidate prices and push to Firebase for price history
    log("✅ Daily sync completed successfully.");
  } catch (err) {
    error("❌ Error during daily sync:", err);
  }
}