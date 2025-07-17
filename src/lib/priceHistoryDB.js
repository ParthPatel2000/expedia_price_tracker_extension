import { openDB } from "idb";


// dev mode logging
const isDev = process.env.NODE_ENV === 'development';

const log = (...args) => isDev && console.log(...args);
const warn = (...args) => isDev && console.warn(...args);
const error = (...args) => isDev && console.error(...args);
//----------------------------------------------------------



const DB_NAME = "PriceTrackerDB";
const DB_VERSION = 1;
const STORE_NAME = "priceHistory";

// Open or create DB
async function initDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "hotelName" });
      }
    },
  });
}

// Example merge function: customize based on your price history data structure
function mergePriceHistory(oldData, newData) {
  // Assuming oldData and newData have a "prices" array, merge unique entries by date or id
  if (!oldData || !oldData.prices) return newData;
  if (!newData || !newData.prices) return oldData;

  const mergedPrices = [...oldData.prices];
  const existingDates = new Set(oldData.prices.map((p) => p.date));

  newData.prices.forEach((priceEntry) => {
    if (!existingDates.has(priceEntry.date)) {
      mergedPrices.push(priceEntry);
    }
  });

  // Sort merged by date ascending (or your preferred order)
  mergedPrices.sort((a, b) => new Date(a.date) - new Date(b.date));

  return { ...newData, prices: mergedPrices };
}

// Save price history data by hotelName with deduplication & merge
export async function savePriceHistoryIDB(hotelName, newData) {
  const db = await initDB();
  const existingEntry = await db.get(STORE_NAME, hotelName);

  if (existingEntry) {
    // Compare timestamps to avoid overwriting fresher data with stale
    // Assuming newData and existingEntry.data have "timestamp" ISO string
    const existingTimestamp = new Date(existingEntry.data.timestamp).getTime();
    const newTimestamp = new Date(newData.timestamp).getTime();

    if (isNaN(newTimestamp)) {
        warn(`savePriceHistoryIDB: newData timestamp invalid for ${hotelName}, saving anyway.`);
    } else if (newTimestamp <= existingTimestamp) {
      // New data older or same, merge partial data instead of overwriting whole
      const mergedData = mergePriceHistory(existingEntry.data, newData);
      await db.put(STORE_NAME, { hotelName, data: mergedData });
        log(`[IDB] Merged price history saved for ${hotelName}`);
      return;
    }
  }

  // Otherwise save/overwrite with newData directly
  await db.put(STORE_NAME, { hotelName, data: newData });
    log(`[IDB] Price history saved for ${hotelName}`);
}

// Get price history data by hotelName
export async function getPriceHistoryIDB(hotelName) {
  const db = await initDB();
  const entry = await db.get(STORE_NAME, hotelName);
  return entry?.data || null;
}

// Remove price history record by hotelName
export async function removePriceHistoryIDB(hotelName) {
  const db = await initDB();
  await db.delete(STORE_NAME, hotelName);
    log(`[IDB] Price history removed for ${hotelName}`);
}
