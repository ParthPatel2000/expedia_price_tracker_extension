// popup.js

import { DocumentReference } from "firebase/firestore";


// Format timestamp into a readable string
function formatDate(dateStr) {
  let d = new Date(dateStr);
  return d.toLocaleString();
}

// Render hotel prices on the popup
function renderPrices(prices) {
  const tbody = document.getElementById('pricesBody');
  tbody.innerHTML = ''; // clear previous

  if (!prices || Object.keys(prices).length === 0) {
    tbody.innerHTML = '<tr><td colspan="3">No prices found. Run the scraper!</td></tr>';
    return;
  }

  for (const [hotel, data] of Object.entries(prices)) {
    const tr = document.createElement('tr');

    const nameTd = document.createElement('td');
    nameTd.textContent = hotel;

    const priceTd = document.createElement('td');
    priceTd.textContent = data.price;

    const timeTd = document.createElement('td');
    timeTd.textContent = formatDate(data.timestamp);

    tr.appendChild(nameTd);
    tr.appendChild(priceTd);
    tr.appendChild(timeTd);

    tbody.appendChild(tr);
  }
}

// Load prices from chrome storage
function loadPrices() {
  chrome.storage.local.get('prices', (result) => {
    renderPrices(result.prices || {});
  });
}

//<-property links management->
// Render property links in the popup
function renderProperties(properties) {
  const tbody = document.getElementById('propertiesBody');
  tbody.innerHTML = ''; // clear previous

  if (!properties || properties.length === 0) {
    tbody.innerHTML = '<tr><td colspan="2">No properties found.</td></tr>';
    return;
  }

  properties.forEach(prop => {
    const tr = document.createElement('tr');
    const nameTd = document.createElement('td');
    nameTd.textContent = prop.name;
    const actionTd = document.createElement('td');
    actionTd.innerHTML = `<button class="remove-btn" data-url="${prop.url}">Remove</button>`;
    tr.appendChild(nameTd);
    tr.appendChild(actionTd);
    tbody.appendChild(tr);
  });
}

// Load properties from chrome storage
function loadProperties() {
  chrome.storage.local.get('propertyLinks', (result) => {
    renderProperties(result.propertyLinks || []);
  });
}

//Remove property link from the list
// This function is called when the remove button is clicked
document.getElementById('propertiesBody').addEventListener('click', (event) => {
  if (event.target.classList.contains('remove-btn')) {
    const url = event.target.getAttribute('data-url');
    let propertyName = '';
    chrome.storage.local.get('propertyLinks', (result) => {
      const property = result.propertyLinks.find(link => link.url === url);
      propertyName = property ? property.name : '';
      const updatedLinks = result.propertyLinks.filter(link => link.url !== url);
      chrome.storage.local.set({ propertyLinks: updatedLinks }, () => {
        renderProperties(updatedLinks);
      });
    });
    // sync the updated property links to Firestore now that a link is removed
    chrome.runtime.sendMessage({ action: 'syncPropertyLinks' });
    //also remove the price data for this property
    chrome.storage.local.get('prices', (result) => {
      const updatedPrices = { ...result.prices };
      delete updatedPrices[propertyName];
      chrome.storage.local.set({ prices: updatedPrices }, () => {
        loadPrices();
      });
    });
  }
});

//<-property links management end->

//save email from the popup to the storage
document.getElementById('saveEmailBtn').addEventListener('click', () => {
  const email = document.getElementById('userEmailInput').value;
  chrome.storage.local.set({ notificationEmail: email }, () => {
    showStatusMsg(`✅ Email saved: ${email}`, false);
  });
});

// Load saved email on popup open
chrome.storage.local.get('notificationEmail', (result) => {
  const email = result.notificationEmail || '';
  document.getElementById('userEmailInput').value = email;
});

//--------------------View Management--------------------
// Toggle views
function showPricesView() {
  document.getElementById('settingsView').style.display = 'none';
  document.getElementById('propertiesView').style.display = 'none';
  document.getElementById('dailyScrapeView').style.display = 'none';
  document.getElementById('pricesView').style.display = 'block';
  loadPrices();
}

function showSettingsView() {
  document.getElementById('pricesView').style.display = 'none';
  document.getElementById('propertiesView').style.display = 'none';
  document.getElementById('dailyScrapeView').style.display = 'none';
  document.getElementById('settingsView').style.display = 'block';
  // Load auth state and update UI
  chrome.storage.local.get('authState', (result) => {
    updateAuthUI(result.authState);
  });

  // Show dev-only elements in development mode
  if (process.env.NODE_ENV === 'development') {
    document.querySelectorAll('.dev-only').forEach(el => {
      el.style.display = 'block'; // or 'inline-block', as needed
    });
  } else {
    // Optionally remove them in production to avoid unused DOM elements
    document.querySelectorAll('.dev-only').forEach(el => el.remove());
  }


  clearStatusMsg();
}

function showPropertiesView() {
  document.getElementById('pricesView').style.display = 'none';
  document.getElementById('settingsView').style.display = 'none';
  document.getElementById('dailyScrapeView').style.display = 'none';
  document.getElementById('propertiesView').style.display = 'block';
  loadProperties();
  document.getElementById('add-link').style.display = 'block'; // Show add link button
}

function showDailyScrapeView() {
  document.getElementById('pricesView').style.display = 'none';
  document.getElementById('settingsView').style.display = 'none';
  document.getElementById('propertiesView').style.display = 'none';
  document.getElementById('dailyScrapeView').style.display = 'block';
  chrome.storage.local.get('dailyScrapeEnabled', (result) => {
    document.getElementById('dailyScrapeSwitch').checked = result.dailyScrapeEnabled !== undefined ? result.dailyScrapeEnabled : false;
  });
  chrome.storage.local.get('dailyScrapeNotificationEnabled', (result) => {
    document.getElementById('dailyScrapeNotificationSwitch').checked = result.dailyScrapeNotificationEnabled !== undefined ? result.dailyScrapeNotificationEnabled : false;
  });
  loadDailyScrapeView(); // Load saved daily scrape time
}

//--------------------View Management End--------------------

// Check authentication state and update UI

function updateAuthUI(authState) {
  const loginBtn = document.getElementById('googleLoginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const userInfo = document.getElementById('userInfo');

  if (authState === 'google') {
    loginBtn.disabled = true;
    logoutBtn.disabled = false;
    userInfo.textContent = "✅ Logged in with Google";
  } else {
    loginBtn.disabled = false;
    logoutBtn.disabled = true;
    userInfo.textContent = "👤 Anonymous user";
  }
}


//function that keeps the ui updated
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local') {
    if (changes.authState) {
      const newState = changes.authState.newValue;
      updateAuthUI(newState); // You can define this function to update UI
    }

    if (changes.prices) {
      loadPrices(); // re-render prices in the popup
    }

    if (changes.propertyLinks) {
      statusMsg = document.getElementById('statusText');
      statusMsg.textContent = "Property links updated. Reloading...";
    }

    if (changes.propertyLinks) {
      loadProperties(); // re-render properties in the popup
    }

    if (changes.dailyScrapeTime) {
      loadDailyScrapeView(); // re-render daily scrape view in the popup
    }
  }
});

//listen for propertyview button click
document.getElementById('propertiesBtn').addEventListener('click', () => {
  showPropertiesView();
});


// Load background tab toggle state
function loadBackgroundTabSetting() {
  chrome.storage.local.get({ backgroundTabs: true }, (result) => {
    document.getElementById('backgroundTabSwitch').checked = result.backgroundTabs;
  });
}

// Save background tab toggle state
document.getElementById('backgroundTabSwitch').addEventListener('change', function () {
  const isChecked = this.checked;
  chrome.storage.local.set({ backgroundTabs: isChecked });
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'logoutUser' });
});


// adding the current page to the storage.
function addCurrentExpediaLink() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentTab = tabs[0];
    const url = currentTab.url;

    if (!url.includes("expedia.com/Hotel-Search")) {
      showStatusMsg("❌ Not an Expedia Hotel Search URL", true);
      return;
    }

    const hotelNameParam = new URL(url).searchParams.get("hotelName");
    const displayName = hotelNameParam ? decodeURIComponent(hotelNameParam.replace(/\+/g, ' ')) : 'Unnamed Hotel';

    chrome.storage.local.get({ propertyLinks: [] }, (result) => {
      const existing = result.propertyLinks || [];

      // Avoid duplicates by checking name
      const alreadyExists = existing.some(p => p.name === displayName);
      if (alreadyExists) {
        showStatusMsg(`⚠️ Property "${displayName}" already tracked.`, true);
        return;
      }

      const newEntry = {
        name: displayName,
        url: url
      };

      const updated = [...existing, newEntry];

      chrome.storage.local.set({ propertyLinks: updated }, () => {
        showStatusMsg(`✅ Saved: ${displayName}`);
      });

      // Notify background script to sync links to Firestore now that a new link is added
      chrome.runtime.sendMessage({ action: 'syncPropertyLinks' });
    });
  });
}

// Load saved delay on popup open
chrome.storage.local.get({ pageDelay: 6 }, (result) => {
  document.getElementById('delayInput').value = result.pageDelay;
});

// Save delay on button click
document.getElementById('saveDelayBtn').addEventListener('click', () => {
  const delay = parseInt(document.getElementById('delayInput').value);
  if (!isNaN(delay) && delay > 0) {
    chrome.storage.local.set({ pageDelay: delay }, () => {
      showStatusMsg(`✅ Page delay saved: ${delay} sec`, false);
    });
  } else {
    alert("Please enter a valid number greater than 0.");
  }
});


// Daily scrape scheduling
document.getElementById('scheduleScrapeBtn').addEventListener('click', () => {
  const timeInput = document.getElementById('dailyScrapeTime').value;
  if (!timeInput) return;

  const [hour, minute] = timeInput.split(':').map(Number);

  chrome.runtime.sendMessage({
    action: 'scheduleDailyScrape',
    hour,
    minute
  });

  showStatusMsg(`📅 Daily scrape scheduled for ${hour}:${minute.toString().padStart(2, '0')}`, false);
});

document.getElementById('cancelScrapeBtn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'cancelDailyScrape' });
  showStatusMsg("🚫 Daily scrape schedule canceled.", true);
});

function loadDailyScrapeView() {
  chrome.storage.local.get('dailyScrapeTime', (result) => {
    const { dailyScrapeTime } = result;
    if (dailyScrapeTime) {

      const hour = String(dailyScrapeTime.hour).padStart(2, '0');
      const minute = String(dailyScrapeTime.minute).padStart(2, '0');
      document.getElementById('dailyScrapeTime').value = `${hour}:${minute}`;
    }
  });
}

// Event listeners for buttons
document.getElementById('settingsBtn').addEventListener('click', showSettingsView);
document.getElementById('backBtn').addEventListener('click', showPricesView);
document.getElementById('backToSettings').addEventListener('click', showSettingsView);
document.getElementById('add-link').addEventListener('click', addCurrentExpediaLink);
document.getElementById('dailyScrapeBtn').addEventListener('click', showDailyScrapeView);

//LISTENER FOR THE dailyScrapeSwitch BUTTON AND SAVE THE STATE IN LOCAL STORAGE FOR THE VISUAL INDICATOR
document.getElementById('dailyScrapeSwitch').addEventListener('change', function () {
  const isChecked = this.checked;
  chrome.storage.local.set({ dailyScrapeEnabled: isChecked });
});

//listner for dailyScrapeNotificationSwitch switch and save the state in local storage for the visual indicator
document.getElementById('dailyScrapeNotificationSwitch').addEventListener('change', function () {
  const isChecked = this.checked;
  chrome.storage.local.set({ dailyScrapeNotificationEnabled: isChecked });
});

document.getElementById('refreshBtn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'startScraping' });
  document.getElementById('refreshBtn').disabled = true;
  setTimeout(() => {
    document.getElementById('refreshBtn').disabled = false;
  }, 3000);
});

// Google OAuth login button
document.getElementById('googleLoginBtn').addEventListener('click', () => {
  // Send message to background script to start OAuth flow
  chrome.runtime.sendMessage({ action: 'startGoogleOAuth' });
  document.getElementById('userInfo').textContent = 'Opening Google sign-in...';
});

// dev only: Sync Firestore with property links button listner
// This listner is not required  is not required in production
// Sync Firestore with property links button
if (process.env.NODE_ENV === 'development') {
  document.getElementById('syncFirestoreBtn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'syncPropertyLinks' });
  });

  // download property links from Firestore button
  document.getElementById('downloadFromCloudBtn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'downloadPropertyLinks' });
  });


  //listen for sendEmailRequest button click
  document.getElementById('sendEmailBtn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'sendEmailRequest' });
  });

}

// Listen for messages from background script to show status messages
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'showStatusMsg') {
    showStatusMsg(message.msg, message.isError);
  }
});


// Status message helper functions
function showStatusMsg(msg, isError = false) {
  const status = document.getElementById('statusText');
  status.textContent = msg;
  status.className = isError ? 'error' : '';
  status.style.color = isError ? 'red' : 'black';
  status.style.display = 'block';
  setTimeout(() => {
    clearStatusMsg();
  }, 3000); // Clear after 3 seconds

}

function clearStatusMsg() {
  const status = document.getElementById('statusText');
  status.textContent = '';
  status.className = '';
}

//call the loginAtStartup function to check if the user is logged in


// Load initial UI state on popup open
window.onload = () => {
  showPricesView();
  loadBackgroundTabSetting();
  chrome.runtime.sendMessage({ action: 'loginAtStartup' });

};
