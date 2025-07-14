import React, { useEffect, useState } from "react";
import "./tailwind.css";

export default function App() {
    const [activeView, setActiveView] = useState("prices");
    const [prices, setPrices] = useState({});
    const [properties, setProperties] = useState([]);
    const [email, setEmail] = useState("");
    const [delay, setDelay] = useState(6);
    const [authState, setAuthState] = useState("anonymous");
    const [backgroundTabs, setBackgroundTabs] = useState(true);
    const [statusMsg, setStatusMsg] = useState("");
    const [isError, setIsError] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0 });
    const [dailyScrape, setDailyScrape] = useState({ enabled: false, time: "11:00", notify: false });

    // Load initial state
    useEffect(() => {
        chrome.storage.local.get(["prices", "propertyLinks", "notificationEmail", "authState", "backgroundTabs", "pageDelay", "dailyScrapeNotificationEnabled", "dailyScrapeTime"], (result) => {
            setPrices(result.prices || {});
            setProperties(result.propertyLinks || []);
            setEmail(result.notificationEmail || "");
            setAuthState(result.authState || "anonymous");
            setBackgroundTabs(result.backgroundTabs ?? true);
            setDelay(result.pageDelay ?? 6);
            setDailyScrape({
                enabled: !!result.dailyScrapeTime,
                time: result.dailyScrapeTime ? `${String(result.dailyScrapeTime.hour).padStart(2, "0")}:${String(result.dailyScrapeTime.minute).padStart(2, "0")}` : "11:00",
                notify: result.dailyScrapeNotificationEnabled ?? false,
            });
        });
        chrome.runtime.sendMessage({ action: "loginAtStartup" });
    }, []);

    // Update on changes
    useEffect(() => {
        const listener = (changes, area) => {
            if (area === "local") {
                if (changes.prices) setPrices(changes.prices.newValue);
                if (changes.propertyLinks) setProperties(changes.propertyLinks.newValue);
                if (changes.authState) setAuthState(changes.authState.newValue);
            }
        };
        chrome.storage.onChanged.addListener(listener);
        return () => chrome.storage.onChanged.removeListener(listener);
    }, []);

    // Handle refresh prices button
    const handleRefresh = () => {
        chrome.runtime.sendMessage({ action: "startScraping" });
    };

    const showStatusMsg = (msg, error = false, timeout = 3000) => {
        setStatusMsg(msg);
        setIsError(error);
        setTimeout(() => setStatusMsg(""), timeout);
    };

    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === "scrapingProgress") {
            setProgress({ current: message.current, total: message.total });
        } else if (message.action === "scrapingDone" || message.action === "scrapingFailed") {
            setProgress({ current: 0, total: 0 });
        } else if (message.action === "showStatusMsg") {
            showStatusMsg(message.msg, message.isError, message.timeout);
        }
    });

    const renderPricesTable = () => {
        if (!prices || Object.keys(prices).length === 0) {
            return (
                <tr><td colSpan="3">No prices found. Run the scraper!</td></tr>
            );
        }
        return Object.entries(prices).map(([hotel, data]) => (
            <tr key={hotel}>
                <td>{hotel}</td>
                <td>{data.price}</td>
                <td>{data.timestamp}</td>
            </tr>
        ));
    };

    return (
        <div className="w-[320px] p-3 font-sans text-sm">
            {activeView === "prices" && (
                <div>
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="font-bold">Hotel Prices</h3>
                        <button onClick={() => setActiveView("settings")}>⚙️ Settings</button>
                    </div>
                    <div className="overflow-y-auto max-h-60 border border-gray-300">
                        <table className="w-full text-left">
                            <thead className="bg-gray-100">
                                <tr><th>Hotel</th><th>Price</th><th>Last Updated</th></tr>
                            </thead>
                            <tbody>{renderPricesTable()}</tbody>
                        </table>
                    </div>
                    <div className="mt-3 flex justify-between items-center">
                        <label className="flex items-center">
                            <input type="checkbox" checked={backgroundTabs} onChange={e => {
                                setBackgroundTabs(e.target.checked);
                                chrome.storage.local.set({ backgroundTabs: e.target.checked });
                            }} />
                            <span className="ml-2">Open tabs in background</span>
                        </label>
                        <button onClick={handleRefresh}>Refresh Prices</button>
                    </div>
                    {progress.total > 0 && (
                        <div className="mt-2 w-full bg-gray-200 rounded">
                            <div className="h-2 bg-green-500" style={{ width: `${(progress.current / progress.total) * 100}%` }}></div>
                        </div>
                    )}
                    {statusMsg && <p className={`mt-2 ${isError ? "text-red-600" : "text-black"}`}>{statusMsg}</p>}
                </div>
            )}

            {activeView === "settings" && (
                <div>
                    <div className="mb-2">
                        <button onClick={() => setActiveView("prices")}>🔙 Back</button>
                    </div>
                    <h3 className="font-bold mb-2">Settings</h3>
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <label>Page Load Delay (sec):</label>
                            <input type="number" value={delay} min={1} onChange={e => {
                                const d = parseInt(e.target.value);
                                if (!isNaN(d)) {
                                    setDelay(d);
                                    chrome.storage.local.set({ pageDelay: d });
                                    showStatusMsg(`✅ Page delay saved: ${d} sec`);
                                }
                            }} className="border px-2 py-1 w-16" />
                        </div>
                        <div className="flex items-center gap-2">
                            <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="border px-2 py-1 flex-1" placeholder="Enter email" />
                            <button onClick={() => {
                                chrome.storage.local.set({ notificationEmail: email });
                                showStatusMsg(`✅ Email saved: ${email}`);
                            }}>Save Email</button>
                        </div>
                        <div className="flex gap-2">
                            <button className="flex-1" onClick={() => setActiveView("properties")}>📂 Saved Properties</button>
                            <button className="flex-1" onClick={() => setActiveView("dailyScrape")}>🗓️ Daily Scrape</button>
                        </div>
                        <div className="flex gap-2">
                            <button className="flex-1" onClick={() => chrome.runtime.sendMessage({ action: "startGoogleOAuth" })}>🔐 Google</button>
                            <button className="flex-1" onClick={() => chrome.runtime.sendMessage({ action: "logoutUser" })}>🚪 Logout</button>
                        </div>
                        <p className="text-gray-600 text-sm">{authState === "google" ? "✅ Logged in with Google" : "👤 Anonymous user"}</p>
                        {statusMsg && <p className={`mt-2 ${isError ? "text-red-600" : "text-black"}`}>{statusMsg}</p>}
                    </div>
                </div>
            )}

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

function PropertiesView({ onBack, statusMsg, isError, showStatusMsg }) {
    const [properties, setProperties] = React.useState([]);

    React.useEffect(() => {
        chrome.storage.local.get('propertyLinks', (result) => {
            setProperties(result.propertyLinks || []);
        });
    }, []);

    function removeProperty(url) {
        chrome.storage.local.get('propertyLinks', (result) => {
            const updated = (result.propertyLinks || []).filter(p => p.url !== url);
            chrome.storage.local.set({ propertyLinks: updated }, () => {
                setProperties(updated);
                chrome.runtime.sendMessage({ action: 'syncPropertyLinks' });
            });
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
            <div className="flex justify-between mb-3">
                <button onClick={onBack} className="btn">🔙 Back</button>
                <button onClick={handleAddLink} className="btn">➕ Add This Property</button>
            </div>
            <h3 className="text-lg font-bold mb-2">Saved Properties</h3>
            <table className="w-full border-collapse border border-gray-300">
                <thead>
                    <tr className="bg-gray-100">
                        <th className="border border-gray-300 p-2 text-left">Name</th>
                        <th className="border border-gray-300 p-2 text-left">Action</th>
                    </tr>
                </thead>
                <tbody>
                    {properties.length === 0 ? (
                        <tr><td colSpan="2" className="p-2 text-center">No properties found.</td></tr>
                    ) : (
                        <>
                            {properties.map((p) => (
                                <tr key={p.url}>
                                    <td className="border border-gray-300 p-2">{p.name}</td>
                                    <td className="border border-gray-300 p-2">
                                        <button
                                            onClick={() => removeProperty(p.url)}
                                            className="text-red-600 hover:underline"
                                        >
                                            Remove
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </>
                    )}
                </tbody>

            </table>
            <div className="mt-3">
                {statusMsg && <p className={`mt-2 ${isError ? "text-red-600" : "text-black"}`}>{statusMsg}</p>}
            </div>
        </section>
    );
}

function DailyScrapeView({ onBack, statusMsg, isError, showStatusMsg }) {
  const [dailyScrapeEnabled, setDailyScrapeEnabled] = React.useState(false);
  const [dailyScrapeNotificationEnabled, setDailyScrapeNotificationEnabled] = React.useState(false);
  const [dailyScrapeTime, setDailyScrapeTime] = React.useState('11:00');

  // Load settings on mount
  React.useEffect(() => {
    chrome.alarms.get('dailyScrape', (alarm) => {
      setDailyScrapeEnabled(!!alarm);
    });

    chrome.storage.local.get('dailyScrapeNotificationEnabled', (result) => {
      setDailyScrapeNotificationEnabled(result.dailyScrapeNotificationEnabled ?? false);
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
    chrome.storage.local.set({ dailyScrapeEnabled: checked });
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

    showStatusMsg(`📅 Scheduled for ${hour}:${minute.toString().padStart(2, '0')}`);
    setDailyScrapeEnabled(true);
  }

  // Handle email notification toggle
  function handleNotificationToggle(e) {
    const checked = e.target.checked;
    setDailyScrapeNotificationEnabled(checked);
    chrome.storage.local.set({ dailyScrapeNotificationEnabled: checked });
    showStatusMsg(`Daily price notification ${checked ? 'enabled' : 'disabled'}`);
  }

  return (
    <section className="p-3">
      <div className="mb-4">
        <button onClick={onBack} className="btn">🔙 Back</button>
      </div>
      <h3 className="text-lg font-bold mb-4">Daily Scrape Schedule</h3>

      <div className="mb-4 flex items-center gap-4">
        <label htmlFor="dailyScrapeTime" className="font-medium">Daily Scrape Time:</label>
        <input
          type="time"
          id="dailyScrapeTime"
          value={dailyScrapeTime}
          onChange={handleTimeChange}
          className="border border-gray-300 rounded px-2 py-1"
          style={{ width: '100px' }}
        />
      </div>

      <div className="mb-4 flex justify-between items-center">
        <label htmlFor="dailyScrapeSwitch" className="font-medium">
          Enable Daily Scrape
        </label>
        <input
          id="dailyScrapeSwitch"
          type="checkbox"
          checked={dailyScrapeEnabled}
          onChange={handleDailyScrapeToggle}
          className="toggle-checkbox"
        />
      </div>

      <div className="mb-4 flex justify-between items-center">
        <label htmlFor="dailyScrapeNotificationSwitch" className="font-medium">
          Send Email Notifications
        </label>
        <input
          id="dailyScrapeNotificationSwitch"
          type="checkbox"
          checked={dailyScrapeNotificationEnabled}
          onChange={handleNotificationToggle}
          className="toggle-checkbox"
        />
      </div>

      {statusMsg && (
        <div
          className={`mt-4 p-2 rounded ${
            isError ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
          }`}
        >
          {statusMsg}
        </div>
      )}
    </section>
  );
}



