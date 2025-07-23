import { log, error, showStatusMsg } from './index.js';
import { savePriceHistoryIDB, getPriceHistoryIDB } from '../lib/priceHistoryDB.js';
import { getPriceBuffer } from './priceStorage.js';
import { auth, db } from './firebase_utils.js';
import { doc, setDoc, getDoc } from 'firebase/firestore';
// Function to group prices by day

/**
 * Summarizes the latest hotel prices from a buffer object.
 *
 * For each hotel, computes the opening price, closing price, price range,
 * average price, and includes metadata such as timestamp, currency, and source.
 * Ignores invalid price entries and defaults to 0 if none are valid.
 *
 * @param {Object} buffer - An object where each key is a hotel name and the
 *   value is an array of price entry objects. Each entry should have a
 *   `price`, `timestamp`, `currency`, and `source` field.
 * @returns {Object} An object mapping hotel names to their summarized price
 *   data, including openingPrice, closingPrice, priceRange, average, currency,
 *   source, and timestamp.
 *
 * @dependency Relies on a global `log` function for warning messages.
 */
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

/**
 * Pushes hotel price summary data to Firebase Firestore for the current user.
 *
 * - Stores data under: users/<uid>/priceHistory/<sanitizedHotel>
 * - Each document is merged with a new date-keyed entry.
 * - Shows status messages via showStatusMsg().
 * - Logs actions using log() and error().
 *
 * @async
 * @function
 * @param {Object} summary - Object mapping hotel names to summary data.
 * @throws {Error} If no user is logged in or Firestore write fails.
 * @dependsOn auth.currentUser, db, nameSanitizer, setDoc, doc,
 *            log, error, showStatusMsg
 */
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

/**
 * Consolidates the local price buffer by summarizing the latest prices and
 * pushing the summary to Firebase. In production mode, clears the local buffer
 * after successful upload.
 *
 * Local Storage Fields Changed:
 * - Clears the local price buffer (via clearPriceBuffer) after pushing to
 *   Firebase, unless in development mode.
 *
 * Dependencies:
 * - getPriceBuffer: Retrieves the current local price buffer.
 * - summarizeLatestPrices: Summarizes the latest prices from the buffer.
 * - pushSummaryToFirebase: Uploads the summary to Firebase.
 * - clearPriceBuffer: Clears the local price buffer.
 * - log: Logs messages for debugging and status updates.
 * - isDev: Determines if the environment is development or production.
 */
export async function consolidatePriceBuffer() {
  const buffer = await getPriceBuffer();
  const summary = summarizeLatestPrices(buffer);
  await pushSummaryToFirebase(summary);
  if (!isDev) await clearPriceBuffer(); // Don't clear buffer in dev mode for testing
  log("the summary of latest prices:", summary);
  log("✅ Consolidated to Firebase and cleared local buffer.");
}

/**
 * Fetches the price history of a hotel from Firebase for the current user.
 *
 * @async
 * @function fetchPriceHistoryfromFirebase
 * @param {string} hotelName - The name of the hotel to fetch history for.
 * @returns {Promise<Object|null>} Resolves with price history data or null if
 *   not found.
 *
 * @throws {Error} If no user is logged in.
 *
 * @dependency
 * - Requires `auth.currentUser` for authentication.
 * - Uses Firestore `db` instance.
 * - Depends on `nameSanitizer` to sanitize hotel names.
 * - Uses `getDoc` and `doc` from Firestore.
 * - Calls `log` for warning messages.
 */
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

/**
 * Fetches the price history for a given hotel from Firebase and stores it in
 * IndexedDB. Logs progress and errors to the console.
 *
 * Dependencies:
 * - fetchPriceHistoryfromFirebase(hotelName): Fetches price history from
 *   Firebase.
 * - savePriceHistoryIDB(hotelName, data): Saves price history to IndexedDB.
 * - log(message): Logs informational messages.
 * - error(message, err): Logs error messages.
 *
 * Local Storage Fields Changed:
 * - IndexedDB: Updates or inserts the price history for the specified hotel.
 *
 * @async
 * @function fetchAndStorePriceHistory
 * @param {string} hotelName - The name of the hotel to fetch price history for.
 * @returns {Promise<void|null>} Returns null if no price history is found.
 */
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


/**
 * Fetches the price history for a given hotel name.
 *
 * Attempts to retrieve price history from IndexedDB (IDB) first. If not found,
 * fetches from Firebase, stores it in IDB, and then retrieves it again.
 *
 * Local Storage/IDB Fields Changed:
 * - Reads from and writes to the price history store in IDB for the hotel.
 *
 * Chrome Messages Sent:
 * - { action: "priceHistoryFetched", hotelName, history }
 *   Sent when price history is successfully fetched.
 * - { action: "noPriceHistory", hotelName, history: null }
 *   Sent when no price history is found or on error.
 *
 * Dependencies:
 * - getPriceHistoryIDB(hotelName): Fetches price history from IDB.
 * - fetchAndStorePriceHistory(hotelName): Fetches from Firebase and stores in IDB.
 * - chrome.runtime.sendMessage: Sends messages to other extension parts.
 * - log: Logs messages for debugging.
 *
 * @async
 * @param {string} hotelName - The name of the hotel to fetch history for.
 * @returns {Promise<Object|null>} Resolves to price history object or null.
 */
export async function getPriceHistory(hotelName) {
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