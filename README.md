# Expedia Price Tracker Chrome Extension
# [![View on Chrome Web Store](https://img.shields.io/chrome-web-store/v/hkohddkblmjfdhlkhnbjoaekkncagcno?label=Chrome%20Web%20Store)](https://chromewebstore.google.com/detail/expedia-price-scraper/hkohddkblmjfdhlkhnbjoaekkncagcno)

**Live on Chrome Web Store:** [Expedia Price Scraper](https://chromewebstore.google.com/detail/expedia-price-scraper/hkohddkblmjfdhlkhnbjoaekkncagcno)

## Overview

Hi! I'm Parth, and this is my solo-developed Chrome extension, **Expedia Price Tracker**. It's a full-featured, production-grade tool designed to automate hotel price tracking on Expedia, visualize historical price trends, and deliver daily email notifications. The extension is live on the Chrome Web Store and leverages a modern stack including React, Firebase, TailwindCSS, and Webpack.

## Features

- **Automated Price Scraping:** Scrapes hotel prices from Expedia at scheduled intervals (daily or frequent) using background scripts and Chrome alarms.
- **Bot Detection Handling:** Detects and gracefully handles bot/captcha pages to ensure robust scraping.
- **Historical Price Database:** Stores daily and monthly price history in Firebase Firestore, enabling rich analytics.
- **Interactive Dashboard:** Built with React and Recharts, the dashboard visualizes price trends, logs, and scraping status.
- **Email Notifications:** Sends daily price summaries to users via Firebase Cloud Functions and Nodemailer.
- **User Authentication:** Supports Google OAuth and anonymous login for secure, personalized data storage.
- **Configurable Scheduling:** Users can set daily scrape times and frequent scrape intervals directly from the popup UI.
- **Property Management:** Syncs property links with Firestore, allowing easy management and cloud backup.
- **Modern UI:** Uses TailwindCSS for a clean, responsive interface in both the popup and dashboard.
- **Production-Ready Build:** Webpack-powered build pipeline with Babel, PostCSS, and automated packaging for Chrome Web Store deployment.

## Architecture

- **Manifest v3:** Utilizes Chrome's latest extension APIs for security and performance.
- **Background Scripts:** Orchestrate scraping, scheduling, and messaging between popup, dashboard, and content scripts.
- **Popup & Dashboard:** Built in React, providing a seamless user experience for viewing prices, managing settings, and visualizing data.
- **Firebase Integration:** Handles authentication, Firestore database operations, and triggers Cloud Functions for email delivery.
- **Cloud Functions:** Node.js functions for sending emails and processing backend tasks, deployed via Firebase.
- **Scraper Logic:** Advanced DOM parsing and event simulation to bypass anti-bot measures and reliably extract price data.

## Technologies Used

- **React 19** (Popup, Dashboard)
- **TailwindCSS** (Styling)
- **Firebase** (Auth, Firestore, Cloud Functions)
- **Webpack 5** (Build system)
- **Babel** (JS/JSX transpilation)
- **Nodemailer** (Email delivery)
- **Chrome Extension APIs** (Alarms, Storage, Messaging, Tabs)
- **Recharts** (Data visualization)
- **IDB** (IndexedDB wrapper for local storage)

## Installation (Development)

1. **Clone the repo:**
	```bash
	git clone https://github.com/ParthPatel2000/expedia_price_tracker_extension.git
	cd expedia_price_tracker_2.0/expedia price tracker
	```
2. **Install dependencies:**
	```bash
	npm install
	cd functions
	npm install
	```
3. **Build the extension:**
	```bash
	npm run ship
	```
4. **Load into Chrome:**
	- Go to `chrome://extensions`
	- Enable "Developer mode"
	- Click "Load unpacked" and select the `build/` folder

## Usage

- **Popup:** Click the extension icon to open the popup. View current prices, refresh scraping, and configure daily/frequent scraping schedules.
- **Dashboard:** Access detailed price history, logs, and analytics via the dashboard (accessible from the popup or options page).
- **Settings:** Manage notification email, property links, and authentication.
- **Email Notifications:** Receive daily price summaries in your inbox (requires email setup in settings).

## Deployment

- **Chrome Web Store:** The extension is packaged and deployed using Webpack and cross-zip, following Chrome's Manifest v3 requirements.
- **Firebase:** Cloud Functions and Firestore are deployed via `firebase deploy`. All sensitive keys are securely managed.
- **Continuous Integration:** The build pipeline ensures code quality with ESLint and automated packaging.

## Why This Project Stands Out

- **End-to-End Ownership:** I designed, built, and deployed every aspect of this project, from frontend UI to backend cloud functions.
- **Scalable Architecture:** The extension is modular, maintainable, and ready for team collaboration or open-source contributions.
- **Real-World Impact:** Solves a genuine problem for travelers and demonstrates advanced automation, cloud integration, and UX design.
- **Production Experience:** I navigated Chrome Web Store deployment, handled edge cases (bot detection, error handling), and built a robust notification system.


## Roadmap

- Multi-user support and sharing
- Advanced analytics (price prediction, alerts)
- Support for more travel sites
- Mobile-friendly dashboard

## Contact

Feel free to reach out via [LinkedIn](https://www.linkedin.com/in/parth472k/) or check out my other projects on [GitHub](https://github.com/ParthPatel2000).
