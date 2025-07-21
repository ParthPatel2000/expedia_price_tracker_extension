// src/content/trackPropertyButton.js

(async function () {

    function getSelectedHotelIdFromUrl(url) {
        const params = new URL(url).searchParams;
        return params.get('selected');
    }

    const header = document.querySelector('header.uitk-card-featured-header');

    if (!header) {
        console.warn('❌ Unique selected property header not found.');
        return;
    }

    const hotelCard = header.nextElementSibling;

    if (!hotelCard || hotelCard.children.length < 2) {
        console.warn('❌ Could not find hotel card structure.');
        return;
    }

    const imageContainer = hotelCard.children[0];

    if (!imageContainer) {
        console.warn('❌ Image container not found.');
        return;
    }

    // Avoid duplicate injection
    if (imageContainer.querySelector('.track-property-btn')) {
        console.log('⚠️ Button already exists.');
        return;
    }

    const hotelName = header.textContent.trim();
    const currentUrl = window.location.href;

    // Check if this property is already tracked
    const { propertyLinks } = await chrome.storage.local.get('propertyLinks');
    const isTracked = (propertyLinks || []).some((prop) => {
        return getSelectedHotelIdFromUrl(prop.url) === getSelectedHotelIdFromUrl(currentUrl);
    });

    if (isTracked) {
        console.log('⚠️ Property already tracked, no button injected.');
        return;
    }

    // Inject the button
    imageContainer.style.position = 'relative';

    const button = document.createElement('button');
    button.textContent = '⭐ Track Property';
    button.className = 'track-property-btn';

    Object.assign(button.style, {
        backgroundColor: '#22c55e',
        color: '#fff',
        padding: '0 16px',
        minHeight: '42px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: '500',
        fontSize: '14px',
        lineHeight: '1',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        position: 'absolute',
        top: '10px',
        left: '10px',
        zIndex: '1000',
    });

    button.addEventListener('click', () => {
        chrome.runtime.sendMessage({
            action: 'trackProperty',
            hotelName,
            url: currentUrl,
        });
        alert(`Property tracked: ${hotelName}`);
    });

    imageContainer.appendChild(button);
    console.log('✅ Button added as green overlay on image.');
})();
