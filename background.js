// const props = [
//   {name:"Econo Lodge", id:"8466", hotelName:"Econo%20Lodge"},
//   {name:"Sleep Inn Concord-Kannapolis", id:"151309", hotelName:"Sleep%20Inn%20Concord%20-%20Kannapolis"},
//   {name:"Country Inn & Suites by Radisson", id:"3580997", hotelName:"Country%20Inn%20%26%20Suites%20by%20Radisson%2C%20Concord%20%28Kannapolis%29%2C%20NC"},
//   {name:"Cabarrus Inn", id:"57359013", hotelName:"Cabarrus%20Inn"},
//   {name:"Rodeway Inn", id:"7422", hotelName:"Rodeway%20Inn"},
//   {name:"Microtel Inn & Suites by Wyndham Kannapolis/Concord", id:"328797", hotelName:"Microtel%20Inn%20%26%20Suites%20by%20Wyndham%20Kannapolis%2FConcord"},
//   {name:"Spark by Hilton Kannapolis", id:"42708", hotelName:"Spark%20by%20Hilton%20Kannapolis"},
//   {name:"Comfort Suites Concord Mills", id:"912941", hotelName:"Comfort%20Suites%20Concord%20Mills"},
//   {name:"Sleep Inn & Suites at Concord Mills", id:"533926", hotelName:"Sleep%20Inn%20%26%20Suites%20at%20Concord%20Mills"}
// ];

// const props = [
//   { name: "Econo Lodge", url: "https://www.expedia.com/Hotel-Search?destination=Kannapolis%2C%20North%20Carolina%2C%20United%20States%20of%20America&regionId=55137&latLong=35.487362%2C-80.621735&flexibility=0_DAY&d1=2025-06-15&startDate=2025-06-15&d2=2025-06-16&endDate=2025-06-16&adults=2&rooms=1&isInvalidatedDate=false&upsellingNumNightsAdded=&theme=&userIntent=&semdtl=&upsellingDiscountTypeAdded=&categorySearch=&useRewards=false&sort=RECOMMENDED&hotelName=Econo%20Lodge&selected=8466" },
//   { name: "Sleep Inn Concord-Kannapolis", url: "https://www.expedia.com/Hotel-Search?destination=Kannapolis%2C%20North%20Carolina%2C%20United%20States%20of%20America&regionId=55137&latLong=35.487362%2C-80.621735&flexibility=0_DAY&d1=2025-06-15&startDate=2025-06-15&d2=2025-06-16&endDate=2025-06-16&adults=2&rooms=1&isInvalidatedDate=false&upsellingNumNightsAdded=&theme=&userIntent=&semdtl=&upsellingDiscountTypeAdded=&categorySearch=&useRewards=false&sort=RECOMMENDED&hotelName=Sleep%20Inn%20Concord%20-%20Kannapolis&selected=151309" }
// ];

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

chrome.action.onClicked.addListener(() => {
  openTabsAndScrape();
});

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

