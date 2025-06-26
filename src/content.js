// content.js
(function() {
  
  console.log("✅ content.js loaded");
  // Check if sold out message exists
  const soldOutElement = document.querySelector('.uitk-text-negative-theme');
  let price = '';

  if (soldOutElement && soldOutElement.textContent.toLowerCase().includes('sold out')) {
    price = 'Sold Out';
  } else {
    // Try to get the price div text content
    let priceElement = document.querySelector('.uitk-text.uitk-type-300.uitk-type-regular.uitk-text-default-theme');
    price = priceElement ? priceElement.textContent.trim() : 'Price not found';
    price = price.replace(/nightly/gi, '').trim();
  }

  // Get hotel name from URL param for clarity
  let params = new URLSearchParams(window.location.search);
  let hotelName = params.get('hotelName') || 'Unknown Hotel';

  console.log(`💾 Stored/updated price for ${hotelName}:`, price);

  chrome.runtime.sendMessage({ price, hotelName });
})();
