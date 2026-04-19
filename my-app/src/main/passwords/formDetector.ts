/**
 * formDetector.ts — JavaScript to inject into tab webContents for detecting
 * password form submissions.
 *
 * The script monitors form submit events and click events on submit buttons.
 * When a form containing a password field is submitted, it sends the
 * credentials back to the main process via postMessage on the window object,
 * which Electron can capture via webContents IPC.
 *
 * Since tabs are sandboxed (no preload, no nodeIntegration), we use
 * webContents.executeJavaScript to inject this and capture results via
 * webContents.on('ipc-message-sync') or a polling approach.
 *
 * The approach used here: inject a MutationObserver + submit listener,
 * and use console.log with a unique prefix that the main process can parse
 * from the console-message event.
 */

const FORM_DETECTOR_PREFIX = '__AGB_PWD__';

export function getFormDetectorScript(): string {
  return `
(function() {
  if (window.__agb_pwd_detector__) return;
  window.__agb_pwd_detector__ = true;

  const PREFIX = '${FORM_DETECTOR_PREFIX}';

  function extractCredentials(form) {
    const passwordInputs = form.querySelectorAll('input[type="password"]');
    if (passwordInputs.length === 0) return null;

    let username = '';
    let password = '';

    // Find the password value
    for (const pwInput of passwordInputs) {
      if (pwInput.value) {
        password = pwInput.value;
        break;
      }
    }
    if (!password) return null;

    // Find username: look for email/text/tel inputs that appear before the password
    const allInputs = Array.from(form.querySelectorAll('input'));
    const pwIndex = allInputs.indexOf(passwordInputs[0]);

    for (let i = pwIndex - 1; i >= 0; i--) {
      const input = allInputs[i];
      const type = (input.type || 'text').toLowerCase();
      if (['text', 'email', 'tel'].includes(type) && input.value) {
        username = input.value;
        break;
      }
    }

    // Fallback: check for inputs with common name/id patterns
    if (!username) {
      const usernameSelectors = [
        'input[name*="user"]', 'input[name*="email"]', 'input[name*="login"]',
        'input[name*="account"]', 'input[id*="user"]', 'input[id*="email"]',
        'input[id*="login"]', 'input[autocomplete="username"]',
        'input[autocomplete="email"]',
      ];
      for (const sel of usernameSelectors) {
        const el = form.querySelector(sel);
        if (el && el.value && el.type !== 'password') {
          username = el.value;
          break;
        }
      }
    }

    return { username, password, origin: window.location.origin };
  }

  function reportCredentials(creds) {
    if (!creds) return;
    console.log(PREFIX + JSON.stringify(creds));
  }

  // Listen for form submissions
  document.addEventListener('submit', function(e) {
    if (e.target && e.target.tagName === 'FORM') {
      const creds = extractCredentials(e.target);
      reportCredentials(creds);
    }
  }, true);

  // Also intercept click on submit buttons (some SPAs don't fire submit events)
  document.addEventListener('click', function(e) {
    const btn = e.target.closest('button[type="submit"], input[type="submit"]');
    if (!btn) return;
    const form = btn.closest('form');
    if (!form) return;
    const creds = extractCredentials(form);
    reportCredentials(creds);
  }, true);

  // Handle Enter key in password fields
  document.addEventListener('keydown', function(e) {
    if (e.key !== 'Enter') return;
    const input = e.target;
    if (!input || input.tagName !== 'INPUT') return;
    if (input.type !== 'password') return;
    const form = input.closest('form');
    if (!form) return;
    const creds = extractCredentials(form);
    reportCredentials(creds);
  }, true);
})();
`;
}

export { FORM_DETECTOR_PREFIX };
