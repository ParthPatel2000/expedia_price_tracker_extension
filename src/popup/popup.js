// popup.js


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


//save email from the popup to the storage
document.getElementById('saveEmailBtn').addEventListener('click', () => {
  const email = document.getElementById('userEmailInput').value;
  chrome.storage.local.set({ notificationEmail: email }, () => {
    console.log("Email saved:", email);
  });
});

// Load saved email on popup open
chrome.storage.local.get('notificationEmail', (result) => {
  const email = result.notificationEmail || '';
  document.getElementById('userEmailInput').value = email;
});

// Toggle views
function showPricesView() {
  document.getElementById('pricesView').style.display = 'block';
  document.getElementById('settingsView').style.display = 'none';
  document.getElementById('propertiesView').style.display = 'none';
  loadPrices();
}

function showSettingsView() {
  document.getElementById('pricesView').style.display = 'none';
  document.getElementById('propertiesView').style.display = 'none';
  document.getElementById('settingsView').style.display = 'block';
  chrome.storage.local.get('authState', (result) => {
    updateAuthUI(result.authState);
  });
  clearStatusMsg();
}

function showPropertiesView() {
  document.getElementById('pricesView').style.display = 'none';
  document.getElementById('settingsView').style.display = 'none';
  document.getElementById('propertiesView').style.display = 'block';
  loadProperties();
  document.getElementById('add-link').style.display = 'block'; // Show add link button
}

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
      console.log("🔄 Property links changed");
    }

    if (changes.propertyLinks) {
      loadProperties(); // re-render properties in the popup
    }

  }
});

//listen for propertyview button click
document.getElementById('propertiesBtn').addEventListener('click', () => {
  showPropertiesView();
});

//listen for sendEmailRequest button click
document.getElementById('sendEmailBtn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'sendEmailRequest' });
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
      console.warn("❌ Not an Expedia Hotel Search URL");
      return;
    }

    const hotelNameParam = new URL(url).searchParams.get("hotelName");
    const displayName = hotelNameParam ? decodeURIComponent(hotelNameParam.replace(/\+/g, ' ')) : 'Unnamed Hotel';

    chrome.storage.local.get({ propertyLinks: [] }, (result) => {
      const existing = result.propertyLinks || [];

      // Avoid duplicates by checking URL
      const alreadyExists = existing.some(p => p.url === url);
      if (alreadyExists) {
        console.log("⚠️ Property already saved.");
        return;
      }

      const newEntry = {
        name: displayName,
        url: url
      };

      const updated = [...existing, newEntry];

      chrome.storage.local.set({ propertyLinks: updated }, () => {
        console.log(`✅ Saved: ${displayName}`);
      });

      // Notify background script to sync links to Firestore
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
      console.log(`✅ Page delay saved: ${delay} sec`);
    });
  } else {
    alert("Please enter a valid number greater than 0.");
  }
});


// Event listeners for buttons
document.getElementById('settingsBtn').addEventListener('click', showSettingsView);
document.getElementById('backBtn').addEventListener('click', showPricesView);
document.getElementById('backToSettings').addEventListener('click', showSettingsView);
document.getElementById('add-link').addEventListener('click', addCurrentExpediaLink);


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

// Sync Firestore with property links button
document.getElementById('syncFirestoreBtn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'syncPropertyLinks' });
});

// download property links from Firestore button
document.getElementById('downloadFromCloudBtn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'downloadPropertyLinks' });
});

// Status message helper functions
function showStatusMsg(msg, isError = false) {
  const status = document.getElementById('statusMsg');
  status.textContent = msg;
  status.className = isError ? 'error' : '';
}

function clearStatusMsg() {
  const status = document.getElementById('statusMsg');
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
