import React, { use, useEffect, useState } from "react";
import "./tailwind.css";

export default function App() {
    const [activeView, setActiveView] = useState("prices");
    const [statusMsg, setStatusMsg] = useState("");
    const [isError, setIsError] = useState(false);

    // Load initial state
    useEffect(() => {
        chrome.runtime.sendMessage({ action: "loginAtStartup" });
    }, []);

    useEffect(() => {
        const messageListener = (message) => {
            if (message.action === "showStatusMsg") {
                showStatusMsg(message.msg, message.isError, message.timeout);
            }
        };
        chrome.runtime.onMessage.addListener(messageListener);
        return () => chrome.runtime.onMessage.removeListener(messageListener);
    }, [showStatusMsg]);


    const showStatusMsg = (msg, error = false, timeout = 3000) => {
        setStatusMsg(msg);
        setIsError(error);
        setTimeout(() => setStatusMsg(""), timeout);
    };

    return (
        <div className="w-[370px] p-3 font-sans text-sm">
            {activeView === "prices" && (
                <PricesView
                    setActiveView={setActiveView}
                    statusMsg={statusMsg}
                    isError={isError}
                    showStatusMsg={showStatusMsg}
                />
            )}

            {activeView === "settings" && (
                <SettingsView
                    setActiveView={setActiveView}
                    showStatusMsg={showStatusMsg}
                    isError={isError}
                    statusMsg={statusMsg}
                />)}

            {activeView === 'properties' && (
                <PropertiesView
                    onBack={() => setActiveView('settings')}
                    statusMsg={statusMsg}
                    isError={isError}
                    showStatusMsg={showStatusMsg}
                />
            )}

            {activeView === 'dailyScrape' && (
                <DailyScrapeView
                    onBack={() => setActiveView('settings')}
                    statusMsg={statusMsg}
                    isError={isError}
                    showStatusMsg={showStatusMsg}
                />
            )}
        </div>
    );
}

// PricesView displays the current hotel prices, allows refreshing, and shows scraping progress/status.
function PricesView({ setActiveView, statusMsg, isError, showStatusMsg }) {
    const [prices, setPrices] = useState({});
    const [backgroundTabs, setBackgroundTabs] = useState(true);
    const [progress, setProgress] = useState({ current: 0, total: 0 });
    const [isScraping, setIsScraping] = useState(false);

    // Load initial prices and settings
    useEffect(() => {
        chrome.storage.local.get(["prices", "backgroundTabs", "scrapeProgress", "isScraping"], (result) => {
            setPrices(result.prices || {});
            setBackgroundTabs(result.backgroundTabs ?? true);
            setProgress(result.scrapeProgress ?? { current: 0, total: 0 });
            setIsScraping(result.isScraping ?? false);
        });
    }, []);

    // Listen for changes in prices
    useEffect(() => {
        const listener = (changes, area) => {
            if (area === "local" && changes.prices) {
                setPrices(changes.prices.newValue);
            }
            if (area === 'local' && changes.scrapeProgress) {
                setProgress(changes.scrapeProgress.newValue);
            }
            if (area === 'local' && changes.isScraping) {
                setIsScraping(changes.isScraping.newValue);
            }
        };
        chrome.storage.onChanged.addListener(listener);
        return () => chrome.storage.onChanged.removeListener(listener);
    }, []);

    //status messages
    useEffect(() => {
        const messageListener = (message) => {
            if (message.action === "scrapingDone" || message.action === "scrapingFailed") {
                showStatusMsg(message.action === "scrapingFailed" ? "❌ Scraping failed" : "✅ Scraping completed");
            }
        };
        chrome.runtime.onMessage.addListener(messageListener);
        return () => {
            chrome.runtime.onMessage.removeListener(messageListener);
        };
    }, [showStatusMsg]);

    // Handle refresh prices button
    const handleRefresh = () => {
        chrome.runtime.sendMessage({ action: "startScraping" });
    };

    // Render the prices table
    const renderPricesTable = () => {
        if (!prices || Object.keys(prices).length === 0) {
            return (
                <tr>
                    <td colSpan="3" className="p-4 text-center text-gray-500">
                        No prices found. Run the scraper!
                    </td>
                </tr>
            );
        }
        return Object.entries(prices).map(([hotel, data]) => (
            <tr key={hotel} className="table-row">
                <td className="table-cell">{hotel}</td>
                <td className="table-cell">{data.price}</td>
                <td className="table-cell">{data.timestamp}</td>
            </tr>
        ));
    };
    return (
        <div>
            {/* Dev-only controls */}
            {process.env.NODE_ENV === "development" && (
                <div className="flex gap-2 mb-2">
                    <button
                        onClick={() => {
                            chrome.storage.local.remove("prices", () => {
                                setPrices({});
                                showStatusMsg("🧹 Cleared all prices");
                            });
                        }}
                        className="btn-danger"
                    >
                        🧹 Clear Prices
                    </button>
                </div>
            )}

            <div className="flex justify-between items-center mb-3">
                <h3 className="heading-lg">Hotel Prices</h3>
                <button onClick={() => setActiveView("settings")} className="btn">
                    ⚙️ Settings
                </button>
            </div>

            <div className="table-scroll-container">
                <table className="table">
                    <thead className="table-header sticky top-0 bg-gray-100">
                        <tr>
                            <th className="table-cell">Hotel</th>
                            <th className="table-cell">Price</th>
                            <th className="table-cell">Updated At</th>
                        </tr>
                    </thead>
                    <tbody>{renderPricesTable()}</tbody>
                </table>
            </div>

            <div className="mt-3 flex justify-between items-center">
                <label className="flex items-center cursor-pointer select-none">
                    <input
                        type="checkbox"
                        checked={backgroundTabs}
                        onChange={(e) => {
                            setBackgroundTabs(e.target.checked);
                            chrome.storage.local.set({ backgroundTabs: e.target.checked });
                        }}
                        className="checkbox"
                    />
                    <span className="ml-2 text-gray-800">Open tabs in background</span>
                </label>

                {/* Refresh Prices Button */}
                <button
                    onClick={handleRefresh}
                    disabled={isScraping}
                    className="relative overflow-hidden btn hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                    {/* Progress fill */}
                    {progress.total > 0 && (
                        <div
                            className="absolute left-0 top-0 h-full bg-green-500 opacity-80 transition-[width] duration-300 ease-linear"
                            style={{ width: `${(progress.current / progress.total) * 100}%` }}
                        />
                    )}

                    {/* Button text */}
                    <span className="relative z-10">Refresh Prices</span>
                </button>
            </div>

            {statusMsg && (
                <p className={`mt-2 font-medium ${isError ? "alert-error" : "alert-success"}`}>
                    {statusMsg}
                </p>
            )}
        </div>

    );
}

function SettingsView({
    setActiveView, showStatusMsg, isError, statusMsg
}) {

    const [email, setEmail] = useState("");
    const [delay, setDelay] = useState(6);
    const [authState, setAuthState] = useState("anonymous");

    useEffect(() => {
        chrome.storage.local.get(["notificationEmail", "authState", "pageDelay"], (result) => {
            setEmail(result.notificationEmail || "");
            setAuthState(result.authState || "anonymous");
            setDelay(result.pageDelay ?? 6);
        });
    }, []);

    useEffect(() => {
        const listener = (changes, area) => {
            if (area === "local") {
                if (changes.notificationEmail) setEmail(changes.notificationEmail.newValue);
                if (changes.pageDelay) setDelay(changes.pageDelay.newValue);
                if (changes.authState) setAuthState(changes.authState.newValue);
            }
        };
        chrome.storage.onChanged.addListener(listener);
        return () => {
            chrome.storage.onChanged.removeListener(listener);
        };
    }, []);


    return (
        <div>
            {/* Dev Mode Buttons */}
            {process.env.NODE_ENV === "development" && (
                <div className="flex gap-2 mb-3">
                    <button
                        onClick={() => chrome.runtime.sendMessage({ action: "syncPropertyLinks" })}
                        className="btn bg-purple-600 hover:bg-purple-700"
                    >
                        ⬆️ Sync
                    </button>
                    <button
                        onClick={() => chrome.runtime.sendMessage({ action: "downloadPropertyLinks" })}
                        className="btn"
                    >
                        ⬇️ Download
                    </button>
                    <button
                        onClick={() => chrome.runtime.sendMessage({ action: "testMail" })}
                        className="btn bg-green-600 hover:bg-green-700"
                    >
                        📧 Test Email
                    </button>
                </div>
            )}

            {/* Back Button */}
            <div className="mb-2">
                <button
                    onClick={() => setActiveView("prices")}
                    className="btn bg-gray-300 hover:bg-gray-400 text-black"
                >
                    🔙 Back
                </button>
            </div>

            {/* Header */}
            <h3 className="heading-md mb-3">Settings</h3>

            {/* Settings Form */}
            <div className="space-y-4">
                {/* Page Delay */}
                <div className="flex items-center gap-3">
                    <label className="label">Page Load Delay (sec):</label>
                    <input
                        type="number"
                        value={delay}
                        min={1}
                        onChange={e => {
                            const d = parseInt(e.target.value);
                            if (!isNaN(d)) {
                                setDelay(d);
                                chrome.storage.local.set({ pageDelay: d });
                                showStatusMsg(`✅ Page delay saved: ${d} sec`);
                            }
                        }}
                        className="input w-20"
                    />
                </div>

                {/* Email Field */}
                <div className="flex items-center gap-3">
                    <input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        className="input flex-1"
                        placeholder="Enter email"
                    />
                    <button
                        onClick={() => {
                            chrome.storage.local.set({ notificationEmail: email });
                            showStatusMsg(`✅ Email saved: ${email}`);
                        }}
                        className="btn"
                    >
                        Save Email
                    </button>
                </div>

                {/* Navigation Buttons */}
                <div className="flex gap-3">
                    <button className="btn w-40 bg-gray-100 hover:bg-gray-200 text-black flex items-center justify-center gap-2 min-h-[42px]" onClick={() => setActiveView("properties")}>
                        <span style={{ display: 'inline-block', lineHeight: 1, verticalAlign: 'middle', fontSize: '1.25rem' }}>📂</span>
                        <span style={{ lineHeight: 1, verticalAlign: 'middle', fontWeight: 500, fontSize: '0.875rem' }}>Saved Properties</span>
                    </button>
                    <button className="btn w-40 bg-gray-100 hover:bg-gray-200 text-black flex items-center justify-center gap-2 min-h-[42px]" onClick={() => setActiveView("dailyScrape")}>
                        <span style={{ display: 'inline-block', lineHeight: 1, verticalAlign: 'middle', fontSize: '1.25rem' }}>🗓️</span>
                        <span style={{ lineHeight: 1, verticalAlign: 'middle', fontWeight: 500, fontSize: '0.875rem' }}>Daily Scrape</span>
                    </button>
                </div>

                <div className="flex gap-3 mt-3">
                    <button className="btn w-40 bg-yellow-500 hover:bg-yellow-600 text-black flex items-center justify-center gap-2 min-h-[42px]" onClick={() => chrome.runtime.sendMessage({ action: "startGoogleOAuth" })}>
                        <span style={{ display: 'inline-block', lineHeight: 1, verticalAlign: 'middle', fontSize: '1.25rem' }}>🔐</span>
                        <span style={{ lineHeight: 1, verticalAlign: 'middle', fontWeight: 500, fontSize: '0.875rem' }}>Google</span>
                    </button>
                    <button className="btn-danger btn w-40 flex items-center justify-center gap-2 min-h-[42px]" onClick={() => chrome.runtime.sendMessage({ action: "logoutUser" })}>
                        <span style={{ display: 'inline-block', lineHeight: 1, verticalAlign: 'middle', fontSize: '1.25rem' }}>🚪</span>
                        <span style={{ lineHeight: 1, verticalAlign: 'middle', fontWeight: 500, fontSize: '0.875rem' }}>Logout</span>
                    </button>
                </div>



                {/* Auth State Info */}
                <p className="text-gray-600 text-sm">
                    {authState === "google" ? "✅ Logged in with Google" : "👤 Anonymous user"}
                </p>

                {/* Status Message */}
                {statusMsg && (
                    <div className={`alert ${isError ? "alert-error" : "alert-success"}`}>
                        {statusMsg}
                    </div>
                )}
            </div>
        </div>


    );
}

function PropertiesView({ onBack, statusMsg, isError, showStatusMsg }) {
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

function DailyScrapeView({ onBack, statusMsg, isError, showStatusMsg }) {
    const [dailyScrapeEnabled, setDailyScrapeEnabled] = React.useState(false); //local state for toggle
    const [dailyScrapeTime, setDailyScrapeTime] = React.useState('11:10'); //default time

    // Load settings on mount
    React.useEffect(() => {
        chrome.alarms.get('dailyScrape', (alarm) => {
            setDailyScrapeEnabled(!!alarm);
        });

        chrome.storage.local.get('dailyScrapeTime', (result) => {
            if (result.dailyScrapeTime) {
                const hour = String(result.dailyScrapeTime.hour).padStart(2, '0');
                const minute = String(result.dailyScrapeTime.minute).padStart(2, '0');
                setDailyScrapeTime(`${hour}:${minute}`);
            }
        });
    }, []);

    // Handle toggle of daily scrape
    function handleDailyScrapeToggle(e) {
        const checked = e.target.checked;

        if (checked) {
            if (!dailyScrapeTime) {
                showStatusMsg('⛔ Select a time before enabling.', true);
                setDailyScrapeEnabled(false);
                return;
            }
            const [hour, minute] = dailyScrapeTime.split(':').map(Number);

            chrome.runtime.sendMessage({
                action: 'scheduleDailyScrape',
                hour,
                minute,
            });
            showStatusMsg(`📅 Scheduled for ${hour}:${minute.toString().padStart(2, '0')}`);
        } else {
            chrome.runtime.sendMessage({ action: 'cancelDailyScrape' });
            showStatusMsg('🚫 Scrape canceled.');
        }

        setDailyScrapeEnabled(checked);
    }

    // Handle time change
    function handleTimeChange(e) {
        const timeVal = e.target.value;
        setDailyScrapeTime(timeVal);

        const [hour, minute] = timeVal.split(':').map(Number);
        chrome.runtime.sendMessage({
            action: 'scheduleDailyScrape',
            hour,
            minute,
        });

        if (hour === undefined || minute === undefined || isNaN(hour) || isNaN(minute)) {
            showStatusMsg("⛔ Invalid time format", true);
            return;
        }
        setDailyScrapeEnabled(true);
        showStatusMsg(`📅 Scheduled for ${hour}:${minute.toString().padStart(2, '0')}`);
    }

    return (
        <section className="p-3">
            {/* Back Button */}
            <div className="mb-4">
                <button onClick={onBack} className="btn">🔙 Back</button>
            </div>

            {/* Title */}
            <h3 className="heading-md mb-4">Daily Scrape Schedule</h3>

            {/* Scrape Time */}
            <div className="mb-4 flex items-center justify-between gap-3">
                {/* Left label */}
                <label htmlFor="dailyScrapeTime" className="label">
                    Daily Scrape Time
                </label>

                {/* Time input with switch */}
                <div className="relative w-44">
                    <input
                        type="time"
                        id="dailyScrapeTime"
                        value={dailyScrapeTime}
                        onChange={handleTimeChange}
                        className="input w-full pr-14"
                    />

                    {/* Toggle Switch */}
                    <label
                        htmlFor="dailyScrapeSwitch"
                        className="absolute right-1 top-1/2 -translate-y-1/2 toggle-switch"
                    >
                        <input
                            id="dailyScrapeSwitch"
                            type="checkbox"
                            checked={dailyScrapeEnabled}
                            onChange={handleDailyScrapeToggle}

                        />
                        <span className="toggle-slider"></span>
                    </label>
                </div>
            </div>


            {/* Status Message */}
            {statusMsg && (
                <div className={`alert mt-2 ${isError ? "alert-error" : "alert-success"}`}>
                    {statusMsg}
                </div>
            )}
        </section>

    );
}



