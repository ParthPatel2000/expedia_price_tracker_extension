import React, { use, useEffect, useState } from "react";
import "./tailwind.css";

export default function SettingsView({
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
                        title="Sync Property Links to Firebase"
                    >
                        ⬆️
                    </button>
                    <button
                        onClick={() => chrome.runtime.sendMessage({ action: "downloadPropertyLinks" })}
                        className="btn"
                        title="Download Property Links from Firebase"
                    >
                        ⬇️
                    </button>
                    <button
                        onClick={() => chrome.runtime.sendMessage({ action: "testMail" })}
                        className="btn bg-green-600 hover:bg-green-700"
                        title="Send Test Email"
                    >
                        📧
                    </button>
                    <button
                        onClick={() => chrome.runtime.sendMessage({ action: "getSummaryPrices" })}
                        className="btn bg-blue-600 hover:bg-blue-700 hover:text-white"
                        title="Get Summary Prices"
                    >
                        📊
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