import React, { use, useEffect, useState } from "react";
import "./tailwind.css";

export default function PropertiesView({ onBack, statusMsg, isError, showStatusMsg }) {
    const [properties, setProperties] = useState([]);

    useEffect(() => {
        chrome.storage.local.get('propertyLinks', (result) => {
            setProperties(result.propertyLinks || []);
        });
    }, []);

    useEffect(() => {
        const listener = (changes, area) => {
            if (area === "local" && changes.propertyLinks) {
                setProperties(changes.propertyLinks.newValue || []);
            }
        };

        chrome.storage.onChanged.addListener(listener);
        return () => {
            chrome.storage.onChanged.removeListener(listener);
        };
    }, []);

    function removeProperty(name) {
        chrome.storage.local.get(['propertyLinks', 'prices'], (result) => {
            const updatedProperties = (result.propertyLinks || []).filter(p => p.name !== name);

            const updatedPrices = { ...(result.prices || {}) };
            if (updatedPrices.hasOwnProperty(name)) {
                delete updatedPrices[name];
            }

            chrome.storage.local.set(
                { propertyLinks: updatedProperties, prices: updatedPrices },
                () => {
                    setProperties(updatedProperties);
                    chrome.runtime.sendMessage({ action: 'syncPropertyLinks' });
                }
            );
        });
    }


    const handleAddLink = () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const url = tabs[0].url;
            if (!url.includes("expedia.com/Hotel-Search")) {
                showStatusMsg("❌ Not an Expedia Hotel Search URL", true);
                return;
            }
            const hotelName = new URL(url).searchParams.get("hotelName");
            const displayName = hotelName ? decodeURIComponent(hotelName.replace(/\+/g, " ")) : "Unnamed Hotel";

            chrome.storage.local.get({ propertyLinks: [] }, (result) => {
                const existing = result.propertyLinks || [];
                if (existing.some(p => p.name === displayName)) {
                    showStatusMsg(`⚠️ Property \"${displayName}\" already tracked.`, true);
                    return;
                }
                const updated = [...existing, { name: displayName, url }];
                chrome.storage.local.set({ propertyLinks: updated }, () => {
                    chrome.runtime.sendMessage({ action: "syncPropertyLinks" });
                    showStatusMsg(`✅ Saved: ${displayName}`);
                });
            });
        });
    };


    return (
        <section className="p-3">
            {/* Header Actions */}
            <div className="flex justify-between items-center mb-3">
                <button onClick={onBack} className="btn bg-gray-300 hover:bg-gray-400 text-black">
                    🔙 Back
                </button>
                <button onClick={handleAddLink} className="btn">
                    ➕ Add This Property
                </button>
            </div>

            {/* Section Title */}
            <h3 className="heading-md mb-2">Saved Properties</h3>

            {/* Property Table */}
            <div className="table-scroll-container">
                <table className="table">
                    <thead className="table-header">
                        <tr>
                            <th className="table-cell">Name</th>
                            <th className="table-cell">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {properties.length === 0 ? (
                            <tr>
                                <td colSpan="2" className="table-cell text-center text-gray-500">
                                    No properties found.
                                </td>
                            </tr>
                        ) : (
                            properties.map((p) => (
                                <tr key={p.url} className="table-row">
                                    <td className="table-cell">{p.name}</td>
                                    <td className="table-cell">
                                        <button
                                            onClick={() => removeProperty(p.name)}
                                            className="text-red-600 hover:underline text-sm"
                                        >
                                            Remove
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Status Message */}
            {statusMsg && (
                <div className="mt-3">
                    <div className={`alert ${isError ? "alert-error" : "alert-success"}`}>
                        {statusMsg}
                    </div>
                </div>
            )}
        </section>

    );
}
