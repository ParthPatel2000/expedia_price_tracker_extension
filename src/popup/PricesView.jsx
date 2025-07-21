import React, { use, useEffect, useState } from "react";
import "./tailwind.css";

// PricesView displays the current hotel prices, allows refreshing, and shows scraping progress/status.
export default function PricesView({ setActiveView, statusMsg, isError, showStatusMsg }) {
    const [prices, setPrices] = useState({});
    const [lastUpdated, setLastUpdated] = useState(null);
    const [backgroundTabs, setBackgroundTabs] = useState(true);
    const [progress, setProgress] = useState({ current: 0, total: 0 });
    const [isScraping, setIsScraping] = useState(false);
    const [detectedBot, setDetectedBot] = useState(false);

    // Load initial prices and settings
    useEffect(() => {
        chrome.storage.local.get(["prices", "backgroundTabs", "scrapeProgress", "isScraping", "lastrun", "detectedBot"], (result) => {
            setPrices(result.prices || {});
            setBackgroundTabs(result.backgroundTabs ?? true);
            setProgress(result.scrapeProgress ?? { current: 0, total: 0 });
            setIsScraping(result.isScraping ?? false);
            setDetectedBot(result.detectedBot ?? false);
            setLastUpdated(
                result.lastrun
                    ? new Date(result.lastrun).toLocaleString("en-US", {
                        month: "short", // Jul
                        day: "2-digit", // 21
                        year: "numeric", // 2025
                        hour: "2-digit", // 04
                        minute: "2-digit", // 01\
                        ampm: "short", // PM
                        hour12: true,    // 12-hour format
                    })
                    : null
            );
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
            if (area === 'local' && changes.lastUpdated) {
                setLastUpdated(changes.lastUpdated.newValue);
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

    const dismissBotWarning = () => {
        chrome.storage.local.set({ detectedBot: false }, () => {
            setDetectedBot(false);
        });
    };

    // Handle refresh prices button
    const handleRefresh = () => {
        chrome.runtime.sendMessage({ action: "startScraping" });
    };

    // Render the prices table
    const renderPricesTable = () => {
        if (!prices || Object.keys(prices).length === 0) {
            return (
                <tr>
                    <td colSpan="2" className="p-4 text-center text-gray-500">
                        No prices found. Run the scraper!
                    </td>
                </tr>
            );
        }

        return Object.entries(prices).map(([hotel, data]) => (
            <tr key={hotel} className="table-row">
                <td className="table-cell">{hotel}</td>
                <td className="table-cell w-28 max-w-[10rem]">
                    <div className="grid grid-cols-2 gap-2 items-center">
                        {/* Left column: Price centered vertically */}
                        <div className="flex items-center justify-start h-full">
                            <div className="text-lg font-bold">${data.price}</div>
                        </div>

                        {/* Right column: High on top, Low on bottom */}
                        <div className="flex flex-col justify-between text-xs text-right text-gray-600 h-full">
                            {/* <div className="text-red-500">: ${data.todayshigh}</div>
                            <div className="text-green-500">Low: ${data.todayslow}</div> */}
                            <div><span className="text-green-500">▲</span> ${data.todayshigh}</div>
                            <div><span className="text-red-500">▼</span> ${data.todayslow}</div>

                        </div>
                    </div>
                </td>
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
                    {/* Open Dashboard Button */}
                    <button
                        onClick={() => {
                            chrome.runtime.sendMessage({ action: "openDashboard" });
                        }}
                        className="btn"
                    >
                        🧾 Open Dashboard
                    </button>
                </div>
            )}

            <div className="flex justify-between items-center mb-3">
                <h3 className="heading-lg">Hotel Prices</h3>
                <button onClick={() => setActiveView("settings")} className="btn">
                    ⚙️ Settings
                </button>
            </div>

            {detectedBot && (
                <div className="alert alert-warning mb-4 p-4 rounded border border-yellow-400 bg-yellow-100 text-yellow-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                        ⚠️ Bot detected! Please complete the CAPTCHA at{" "}
                        <a
                            href="https://www.expedia.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline text-blue-600 hover:text-blue-800"
                        >
                            Expedia.com
                        </a>.
                        the scraper will not work until you do so.
                    </div>
                    <button
                        onClick={dismissBotWarning}
                        className="btn"
                        aria-label="Dismiss bot detection warning"
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {lastUpdated && (
                <p className="text-sm text-gray-600 mb-3">Last updated: {lastUpdated}</p>
            )}

            <div className="table-scroll-container">
                <table className="table">
                    <thead className="table-header sticky top-0 bg-gray-100">
                        <tr>
                            <th className="table-cell">Hotel</th>
                            <th className="table-cell">Price</th>
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