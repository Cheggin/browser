/**
 * Profile picker renderer entry point.
 *
 * Sets data-theme="onboarding" on <html> before React mounts.
 * Mounts <ProfilePickerApp /> into #profile-picker-root.
 */

import React from 'react';
import { createRoot } from 'react-dom/client';

import { loadFonts } from '../design/fonts';
import '../design/theme.global.css';
import '../design/theme.onboarding.css';
import '../components/base/components.css';
import './profile-picker.css';

import { ProfilePickerApp } from './ProfilePickerApp';

document.documentElement.dataset.theme = 'onboarding';
loadFonts();

window.addEventListener('error', (e) => {
  console.error('renderer.error', { message: e.message, file: e.filename, line: e.lineno });
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('renderer.unhandledrejection', { reason: String(e.reason) });
});

const container = document.getElementById('profile-picker-root');
if (!container) {
  throw new Error('[profile-picker] #profile-picker-root element not found');
}

const root = createRoot(container);
root.render(
  <React.StrictMode>
    <ProfilePickerApp />
  </React.StrictMode>,
);
