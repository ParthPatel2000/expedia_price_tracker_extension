// Function to format timestamp into a readable string
function formatDate(dateStr) {
  let d = new Date(dateStr);
  return d.toLocaleString();
}

// Function to render the hotel prices on the popup
function renderPrices(prices) {
  const tbody = document.getElementById('pricesBody');
  tbody.innerHTML = ''; // clear previous

  if (!prices || Object.keys(prices).length === 0) {
    tbody.innerHTML = '<tr><td colspan="3">No prices found. Run the scraper!</td></tr>';
    return;
  }

  // Loop through the prices and render them
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

// Function to load the prices from chrome storage
function loadPrices() {
  chrome.storage.local.get('prices', (result) => {
    renderPrices(result.prices || {});
  });
}

// Add event listener for the refresh button
document.getElementById('refreshBtn').addEventListener('click', () => {
  // Trigger scraping (same function your background uses)
  chrome.runtime.sendMessage({ action: 'startScraping' });
  // You can show a quick message or spinner here if you want
  document.getElementById('refreshBtn').disabled = true;
  setTimeout(() => {
    document.getElementById('refreshBtn').disabled = false;
  }, 3000); // Disable for 3 seconds to prevent multiple clicks
});

// Load prices when popup opens
window.onload = loadPrices;

// Add event listener for the background tab switch
document.getElementById('backgroundTabSwitch').addEventListener('change', function () {
  const isChecked = this.checked;

  // Save the state of the switch to chrome storage
  chrome.storage.local.set({ backgroundTabs: isChecked });
});

// Load the background tab setting on page load
chrome.storage.local.get({ backgroundTabs: true }, (result) => {
  document.getElementById('backgroundTabSwitch').checked = result.backgroundTabs;
});
