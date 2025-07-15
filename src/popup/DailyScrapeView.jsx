import React, { use, useEffect, useState } from "react";
import "./tailwind.css";


export default function DailyScrapeView({ onBack, statusMsg, isError, showStatusMsg }) {
    const [dailyScrapeEnabled, setDailyScrapeEnabled] = useState(false); //local state for toggle
    const [dailyScrapeTime, setDailyScrapeTime] = useState('11:10'); //default time
    const [scrapeFrequency, setScrapeFrequency] = useState('30'); //default frequency

    // Load settings on mount
    useEffect(() => {
        chrome.alarms.get('dailyScrape', (alarm) => {
            setDailyScrapeEnabled(!!alarm);
        });

        chrome.alarms.get('frequentScrape', (alarm) => {
            if (alarm) {
                setScrapeFrequency(alarm.periodInMinutes.toString());
            } else {
                setScrapeFrequency('none');
            }
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

    // Handle frequency change
    function handleFrequencyChange(e) {
        const newFrequency = e.target.value;

        setScrapeFrequency(newFrequency);

        if (newFrequency === 'none') {
            chrome.runtime.sendMessage({ action: 'cancelFrequentScrape' });
            showStatusMsg('🚫 Frequent scraping disabled.');
        } else {
            chrome.runtime.sendMessage({ action: 'scheduleFrequentScrape', frequency: newFrequency });
            showStatusMsg(`📅 Frequent scraping enabled: ${newFrequency}`);
        }
    }

    return (
        <section className="p-3">
            {/* Back Button */}
            <div className="mb-4">
                <button onClick={onBack} className="btn">🔙 Back</button>
            </div>

            <label className="flex items-center gap-2">
                <h3 className="heading-md m-0">Daily Scrape Schedule</h3>
            </label>

            <p className="text-[0.75rem] text-gray-500 italic mb-2">
                once per day, sends an email to the saved email address.
            </p>
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

            {/* Title */}
            <label htmlFor="AutoScrape" className="label flex items-center gap-2">
                <h3 className="heading-md m-0">Auto Scrape</h3>
            </label>
            <p className="text-xs text-gray-500 italic mb-2">
                Auto Scrape at the selected interval to keep data fresh. No email is sent.
            </p>


            {/* Auto Scrape Frequency */}
            <div className="mb-4 flex items-center justify-between gap-3">
                <label htmlFor="scrapeFrequency" className="label">
                    Auto Scrape Frequency
                </label>
                <select
                    id="scrapeFrequency"
                    value={scrapeFrequency}
                    onChange={handleFrequencyChange}
                    className="input pr-14 w-44"
                >
                    {process.env.NODE_ENV === 'development' && (
                        <option value="1">1 minute</option>
                    )}
                    <option value="none">Disabled</option>
                    <option value="30">Every 30 minutes</option>
                    <option value="60">Every 1 hour</option>
                    <option value="90">Every 1.5 hours</option>
                    <option value="120">Every 2 hours</option>
                </select>
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



