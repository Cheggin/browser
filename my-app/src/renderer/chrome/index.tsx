import React from 'react';
import { createRoot } from 'react-dom/client';
import { ChromePages } from './ChromePages';
import '../design/theme.global.css';
import './chrome.css';

window.addEventListener('error', (e) => {
  console.error('chrome.error', { message: e.message, file: e.filename, line: e.lineno });
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('chrome.unhandledrejection', { reason: String(e.reason) });
});

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('[chrome] #root element not found');

createRoot(rootEl).render(
  <React.StrictMode>
    <ChromePages />
  </React.StrictMode>,
);
