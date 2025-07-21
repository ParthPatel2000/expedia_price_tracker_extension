// import React, { useEffect, useState } from "react";
// import "./tailwind.css";

// export default function Dashboard() {
//     const [properties, setProperties] = useState([]);
//     const [logs, setLogs] = useState([]);
//     const [monthlyPriceHistories, setMonthlyPriceHistories] = useState({});
//     const [priceHistories, setPriceHistories] = useState({});
//     const STORE_NAME = "todaysPriceHistoryBuffer";

//     const log = (...args) => {
//         const message = args.map((a) => (typeof a === "object" ? JSON.stringify(a) : a)).join(" ");
//         console.log("[Dashboard Log]", message);
//         setLogs((prev) => [...prev.slice(-99), message]); // keep only last 100 logs
//     };

//     useEffect(() => {
//         chrome.runtime.sendMessage({ action: "logMessage", msg: "🔧 Dashboard loaded" });
//         chrome.storage.local.get(['propertyLinks', STORE_NAME], (result) => {
//             setProperties(result.propertyLinks || []);
//             setPriceHistories(result[STORE_NAME] || {});
//             log(`📄 Loaded ${result.propertyLinks?.length || 0} properties`);
//         });
//     }, []);

//     useEffect(() => {
//         const handleMessage = (message, sender, sendResponse) => {
//             if (message.action === "priceHistoryFetched") {
//                 log(`✅ Price history fetched for ${message.hotelName}:`, message.history);
//                 setPriceHistories((prev) => ({
//                     ...prev,
//                     [message.hotelName]: message.history,
//                 }));
//             }
//             else if (message.action === "noPriceHistory") {
//                 log(`⚠️ No price history found for ${message.hotelName}`);
//             }
//         };

//         chrome.runtime.onMessage.addListener(handleMessage);
//         return () => chrome.runtime.onMessage.removeListener(handleMessage);
//     }, []);

//     return (
//         <div className="p-4 font-sans text-sm text-gray-800">
//             <h1 className="text-xl font-bold mb-4">Dashboard</h1>

//             {/* Property Table */}
//             <div className="table-scroll-container mb-4">
//                 <table className="table">
//                     <thead className="table-header">
//                         <tr>
//                             <th className="table-cell">Name</th>
//                             <th className="table-cell">Action</th>
//                         </tr>
//                     </thead>
//                     <tbody>
//                         {properties.length === 0 ? (
//                             <tr>
//                                 <td colSpan="2" className="table-cell text-center text-gray-500">
//                                     No properties found.
//                                 </td>
//                             </tr>
//                         ) : (

//                             properties.map((p) => (
//                                 <tr key={p.url} className="table-row">
//                                     <td className="table-cell">{p.name}</td>
//                                     <td className="table-cell">
//                                         <button
//                                             onClick={() => chrome.runtime.sendMessage({ action: "getPriceHistory", hotelName: p.name })}
//                                             className="btn"
//                                         >
//                                             Price History
//                                         </button>
//                                     </td>
//                                     {priceHistories[p.name] && (
//                                         <tr className="table-row bg-gray-50">
//                                             <td colSpan="2" className="table-cell p-2">
//                                                 <pre className="text-xs whitespace-pre-wrap text-gray-700 bg-white p-2 rounded shadow-inner">
//                                                     {JSON.stringify(priceHistories[p.name], null, 2)}
//                                                 </pre>
//                                             </td>
//                                         </tr>
//                                     )}
//                                 </tr>
//                             ))


//                         )}
//                     </tbody>
//                 </table>
//             </div>

//             {/* Status / Log Console */}
//             <div className="bg-gray-100 p-3 rounded shadow-inner max-h-64 overflow-auto text-xs">
//                 <h2 className="font-semibold mb-1">📋 Status Logs</h2>
//                 <ul className="space-y-1">
//                     {logs.length === 0 ? (
//                         <li className="text-gray-400">No logs yet.</li>
//                     ) : (
//                         logs.map((msg, idx) => (
//                             <li key={idx} className="font-mono text-gray-700">
//                                 {msg}
//                             </li>
//                         ))
//                     )}
//                 </ul>
//             </div>
//             {/* end of Status / Log Console */}
//         </div>
//     );
// }


import React, { useEffect, useState } from "react";
import "./tailwind.css";

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
      chrome.runtime.sendMessage({ action: "getPriceHistory", hotelName });
    }
  };

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
          <h2 className="font-semibold mb-2">Price History for {selectedProperty}</h2>
          {priceHistories[selectedProperty] ? (
            <pre className="text-xs whitespace-pre-wrap text-gray-700 bg-white p-2 rounded shadow-inner max-h-64 overflow-auto">
              {JSON.stringify(priceHistories[selectedProperty], null, 2)}
            </pre>
          ) : (
            <p className="text-gray-500">No price history loaded yet.</p>
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
