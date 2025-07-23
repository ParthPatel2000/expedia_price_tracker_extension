import { log, error, warn } from './index.js';


// Key used in chrome.storage.local
const STORAGE_KEY = "todaysPriceHistoryBuffer";

/**
 * Stores or updates the price for a given hotel in Chrome local storage.
 *
 * - Updates or initializes the `prices` object in local storage with:
 *   - `todayslow`: The lowest price seen today for the hotel.
 *   - `todayshigh`: The highest price seen today for the hotel.
 *   - `price`: The latest price for the hotel.
 * - Calls `resetTodaysPricesIfNeeded` to reset prices if a new day starts.
 * - Persists changes using `chrome.storage.local.set`.
 * - Logs updates using the `log` function.
 * - Adds a price snapshot by calling `addPriceSnapshot`.
 * - Handles errors from `addPriceSnapshot` with the `error` function.
 *
 * @param {string} hotelName - The name of the hotel.
 * @param {string|number} price - The latest price to store.
 *
 * @localstorage {Object} prices
 *   - Keyed by hotel name, each entry contains:
 *     - {number|null} todayslow
 *     - {number|null} todayshigh
 *     - {string|number} price
 *
 * @dependency resetTodaysPricesIfNeeded - Resets prices if the day changes.
 * @dependency log - Logs storage updates.
 * @dependency addPriceSnapshot - Persists a price snapshot.
 * @dependency error - Logs errors from snapshotting.
 */
export async function storePrice(hotelName, price) {

    function isToday(storedTimestamp) {
        if (!storedTimestamp) return false; // No timestamp means not today
        const inputDate = new Date(storedTimestamp); // LOCAL time
        const now = new Date();                      // LOCAL time
        return inputDate.getFullYear() === now.getFullYear()
            && inputDate.getMonth() === now.getMonth()
            && inputDate.getDate() === now.getDate();
    }


    chrome.storage.local.get({ prices: {}, lastRun: null }, async (result) => {
        const prices = result.prices;

        const numericPrice = parseFloat(price);
        const isValidPrice = !isNaN(numericPrice);


        let isNewDay = !isToday(result.lastRun);
        log(`🔄 Checking if today is a new day: ${isNewDay}. Last run timestamp: ${result.lastRun}`);

        // Check if today's date matches the last run date
        if (isNewDay || !prices[hotelName]) {
            // Reset prices for a new day or if hotel is not in storage
            prices[hotelName] = {
                todayslow: isValidPrice ? numericPrice : null,
                todayshigh: isValidPrice ? numericPrice : null,
                price
            };
            log(`🔄 Resetting prices for ${hotelName} due to new day or new hotel entry.`);

        } else if (isValidPrice) {
            prices[hotelName].todayslow = Math.min(
                prices[hotelName].todayslow ?? numericPrice,
                numericPrice
            );

            prices[hotelName].todayshigh = Math.max(
                prices[hotelName].todayshigh ?? numericPrice,
                numericPrice
            );
            prices[hotelName].price = price; // latest price
        }


        chrome.storage.local.set({ prices }, () => {
            log(`💾 Stored/updated price for ${hotelName}:`, prices[hotelName]);
        });
        const agent = await chrome.storage.local.get('agent').then(res => res.agent || 'auto');
        // Add a price snapshot for the hotel
        addPriceSnapshot(hotelName, isValidPrice ? numericPrice : null, 'USD', agent, isNewDay).catch(err => {
            error("❌ Error adding price snapshot:", err);
        });
    });
}

/**
 * Adds a price snapshot for a hotel to local storage under STORAGE_KEY.
 *
 * Features:
 * - Stores price, currency, source, and timestamp for each hotel.
 * - Initializes price history for a hotel if it does not exist.
 * - Uses chrome.storage.local to persist data.
 * - Logs a message when a snapshot is added.
 *
 * Local Storage Fields Changed:
 * - [STORAGE_KEY]: An object mapping hotel names to arrays of price snapshots.
 *   Each snapshot contains: { price, currency, source, timestamp }
 *
 * Dependencies:
 * - Requires chrome.storage.local API.
 * - Uses a global STORAGE_KEY constant.
 * - Uses a global log function for logging.
 *
 * @async
 * @function addPriceSnapshot
 * @param {string} hotelName - The name of the hotel.
 * @param {number} price - The price to record.
 * @param {string} [currency='USD'] - The currency of the price.
 * @param {string} [source='auto'] - The source of the price data.
 * @returns {Promise<void>}
 */
async function addPriceSnapshot(hotelName, price, currency = 'USD', source = 'auto', reset = false) {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    const priceHistory = data[STORAGE_KEY] || {};

    if (!priceHistory[hotelName]) {
        priceHistory[hotelName] = [];
    }

    // If reset is true, clear the existing history for this hotel
    // This allows for fresh snapshots without old data cluttering
    if (reset) {
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

export const getPriceBuffer = () =>
    new Promise(resolve => {
        chrome.storage.local.get([STORAGE_KEY], result => {
            resolve(result[STORAGE_KEY] || {});
        });
    });

/**
 * Retrieves today's price history for a given hotel from the price buffer.
 *
 * Dependencies:
 * - Calls the async function `getPriceBuffer()` to fetch the price buffer.
 * - Uses `chrome.runtime.sendMessage` to communicate with other extension parts.
 * - Uses a `log` function for logging status and results.
 *
 * Chrome Messages Sent:
 * - { action: "noPriceHistory", hotelName, history: null }
 *   Sent if no price history is found for the hotel.
 * - { action: "priceHistoryFetched", hotelName, history: todaysHistory }
 *   Sent if price history is found for the hotel.
 *
 * Features:
 * - Checks if today's price history exists for the specified hotel.
 * - Notifies other extension components about the result via Chrome messages.
 * - Logs the outcome for debugging and tracking.
 *
 * @async
 * @param {string} hotelName - The name of the hotel to fetch price history for.
 * @returns {Promise<Array>} Resolves to an array of today's price history
 *   entries for the hotel, or an empty array if none exist.
 */
export async function getTodaysPriceHistory(hotelName) {
    const buffer = await getPriceBuffer();

    const todaysHistory = buffer[hotelName] || [];
    if (todaysHistory.length === 0) {
        chrome.runtime.sendMessage({ action: "noPriceHistory", hotelName, history: null });
        log(`⚠️ (getTodaysPricehistory): No price history found for ${hotelName}`);
    } else {
        chrome.runtime.sendMessage({ action: "priceHistoryFetched", hotelName, history: todaysHistory });
        log(`✅ (getTodaysPricehistory): Fetched price history for ${hotelName}:`, todaysHistory);
    }
    return todaysHistory;
}