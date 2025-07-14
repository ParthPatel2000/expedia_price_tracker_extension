import React from 'react';
import { createRoot } from 'react-dom/client';
import './tailwind.css';  // ← import Tailwind styles here
import App from './App';

const container = document.getElementById('root');
const root = createRoot(container);
root.render(<App />);
