import React from 'react';
import { createRoot } from 'react-dom/client';
import './tailwind.css';  // ✅ make sure styles load
import Dashboard from './Dashboard'; // 👈 your dashboard component

const container = document.getElementById('root');
const root = createRoot(container);
root.render(<Dashboard />);
