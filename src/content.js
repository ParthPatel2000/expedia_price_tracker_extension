(async function() {
  const configUrl = 'https://raw.githubusercontent.com/ParthPatel2000/expedia_price_tracker_extension/main/src/extension_config.json';

  const defaultConfig = {
    priceSelector: '.uitk-text-default-theme',
    soldOutSelector: '.uitk-text-negative-theme'
  };

  let config;

  try {
    const response = await fetch(configUrl);
    if (!response.ok) throw new Error('Failed to fetch config');
    console.log('using online config.')
    config = await response.json();
  } catch (err) {
    console.warn('⚠️ Using default config due to fetch error:', err);
    config = defaultConfig;
  }

  const soldOutElement = document.querySelector(config.soldOutSelector);
  let price = '';

  if (soldOutElement && soldOutElement.textContent.toLowerCase().includes('sold out')) {
    price = 'Sold Out';
  } else {
    // Find all elements by selector and filter those with 'nightly'
    const candidates = Array.from(document.querySelectorAll(config.priceSelector))
      .filter(el => el.textContent.toLowerCase().includes('nightly'));
    
    if (candidates.length > 0) {
      price = candidates[0].textContent.replace(/nightly/gi, '').trim();
    } else {
      price = 'Price not found';
    }
  }

  let params = new URLSearchParams(window.location.search);
  let hotelName = params.get('hotelName') || 'Unknown Hotel';

  console.log(`💾 Stored/updated price for ${hotelName}:`, price);

  chrome.runtime.sendMessage({ price, hotelName });
})();
