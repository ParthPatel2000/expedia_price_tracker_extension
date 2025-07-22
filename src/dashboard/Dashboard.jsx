import React, { useEffect, useState } from "react";
import "./tailwind.css";
import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
} from "recharts";

export default function Dashboard() {
    const [properties, setProperties] = useState([]);
    const [selectedProperty, setSelectedProperty] = useState(null);
    const [logs, setLogs] = useState([]);
    const [priceHistories, setPriceHistories] = useState({});
    const STORE_NAME = "todaysPriceHistoryBuffer";

    const log = (...args) => {
        const message = args
            .map((a) => (typeof a === "object" ? JSON.stringify(a) : a))
            .join(" ");
        console.log("[Dashboard Log]", message);
        setLogs((prev) => [...prev.slice(-99), message]); // keep last 100 logs
    };

    useEffect(() => {
        chrome.runtime.sendMessage({ action: "logMessage", msg: "🔧 Dashboard loaded" });
        chrome.storage.local.get(["propertyLinks", STORE_NAME], (result) => {
            setProperties(result.propertyLinks || []);
            setPriceHistories(result[STORE_NAME] || {});
            log(`📄 Loaded ${result.propertyLinks?.length || 0} properties`);
        });
    }, []);

    useEffect(() => {
        const handleMessage = (message) => {
            if (message.action === "priceHistoryFetched") {
                log(`✅ Price history fetched for ${message.hotelName}:`, message.history);
                setPriceHistories((prev) => ({
                    ...prev,
                    [message.hotelName]: message.history,
                }));
            } else if (message.action === "noPriceHistory") {
                log(`⚠️ No price history found for ${message.hotelName}`);
            }
        };

        chrome.runtime.onMessage.addListener(handleMessage);
        return () => chrome.runtime.onMessage.removeListener(handleMessage);
    }, []);

    const handleSelectChange = (e) => {
        const hotelName = e.target.value;
        setSelectedProperty(hotelName);
        if (hotelName) {
            chrome.runtime.sendMessage({ action: "getTodaysPriceHistory", hotelName });
        }
    };

    const getChartData = () => {
        const history = priceHistories[selectedProperty];
        if (!history || !Array.isArray(history)) return [];

        return history.map((entry) => {
            const timestamp = new Date(entry?.timestamp);
            const price = Number(entry?.price);
            return {
                time: timestamp.toISOString().slice(11, 16), // "HH:mm"
                price: isNaN(price) ? 0 : price,
            };
        });
    };


    const chartData = getChartData();

    return (
        <div className="p-4 font-sans text-sm text-gray-800 max-w-3xl mx-auto">
            <h1 className="text-xl font-bold mb-4">Dashboard</h1>

            <label htmlFor="property-select" className="block mb-2 font-semibold">
                Select a property:
            </label>
            <select
                id="property-select"
                className="border border-gray-300 rounded p-2 mb-4 w-full"
                value={selectedProperty || ""}
                onChange={handleSelectChange}
            >
                <option value="" disabled>
                    -- Choose a property --
                </option>
                {properties.map((p) => (
                    <option key={p.url} value={p.name}>
                        {p.name}
                    </option>
                ))}
            </select>

            {selectedProperty && (
                <div className="mb-6">
                    <h2 className="font-semibold mb-2">
                        Price History for {selectedProperty}
                    </h2>

                    {chartData.length === 0 ? (
                        <p className="text-gray-500">No valid price data available to plot.</p>
                    ) : (
                        <ResponsiveContainer width="100%" height={300}>
                            <LineChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="time" />
                                <YAxis />
                                <Tooltip />
                                <Line
                                    type="monotone"
                                    dataKey="price"
                                    stroke="#3b82f6"
                                    strokeWidth={2}
                                    dot={false}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    )}
                </div>
            )}

            <div className="bg-gray-100 p-3 rounded shadow-inner max-h-64 overflow-auto text-xs">
                <h2 className="font-semibold mb-1">📋 Status Logs</h2>
                <ul className="space-y-1">
                    {logs.length === 0 ? (
                        <li className="text-gray-400">No logs yet.</li>
                    ) : (
                        logs.map((msg, idx) => (
                            <li key={idx} className="font-mono text-gray-700">
                                {msg}
                            </li>
                        ))
                    )}
                </ul>
            </div>
        </div>
    );
}
