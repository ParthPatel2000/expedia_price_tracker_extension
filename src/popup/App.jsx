import React, { useEffect, useState } from "react";
import "./tailwind.css";
import DailyScrapeView from "./DailyScrapeView";
import PricesView from "./PricesView";
import SettingsView from "./SettingsView";
import PropertiesView from "./PropertiesView";

export default function App() {
    const [activeView, setActiveView] = useState("prices");
    const [statusMsg, setStatusMsg] = useState("");
    const [isError, setIsError] = useState(false);

    const showStatusMsg = (msg, error = false, timeout = 3000) => {
        setStatusMsg(msg);
        setIsError(error);
        setTimeout(() => setStatusMsg(""), timeout);
    };

    useEffect(() => {
        const messageListener = (message) => {
            if (message.action === "showStatusMsg") {
                showStatusMsg(message.msg, message.isError, message.timeout);
            }
        };
        chrome.runtime.onMessage.addListener(messageListener);
        return () => chrome.runtime.onMessage.removeListener(messageListener);
    }, [showStatusMsg]);

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


