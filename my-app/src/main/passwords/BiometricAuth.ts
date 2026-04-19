/**
 * BiometricAuth — Touch ID / system password gating for password operations.
 *
 * Uses Electron's systemPreferences.promptTouchID() on macOS, which
 * automatically falls back to the login password when Touch ID is
 * unavailable or the user clicks "Use Password…".
 *
 * The biometric gate is checked before any sensitive password operation
 * (reveal, copy, edit, autofill) when the user has enabled the preference.
 */

import { systemPreferences } from 'electron';
import { mainLogger } from '../logger';
import { readPrefs } from '../settings/ipc';

const PREF_KEY = 'biometricPasswordLock';

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

export function isBiometricAvailable(): boolean {
  if (process.platform !== 'darwin') {
    mainLogger.info('BiometricAuth.isBiometricAvailable', { available: false, reason: 'not-macos' });
    return false;
  }
  const available = systemPreferences.canPromptTouchID();
  mainLogger.info('BiometricAuth.isBiometricAvailable', { available });
  return available;
}

// ---------------------------------------------------------------------------
// Preference check
// ---------------------------------------------------------------------------

export function isBiometricEnabled(): boolean {
  const prefs = readPrefs();
  const enabled = prefs[PREF_KEY] === true;
  mainLogger.info('BiometricAuth.isBiometricEnabled', { enabled });
  return enabled;
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

/**
 * Prompt the user for biometric authentication.
 * Resolves `true` if the user authenticates, `false` if they cancel or fail.
 *
 * @param reason - Human-readable reason shown in the Touch ID dialog
 */
export async function promptBiometric(reason: string): Promise<boolean> {
  if (!isBiometricEnabled()) {
    mainLogger.info('BiometricAuth.promptBiometric.skipped', { reason: 'not-enabled' });
    return true;
  }

  if (!isBiometricAvailable()) {
    mainLogger.warn('BiometricAuth.promptBiometric.unavailable', {
      msg: 'Biometric enabled but not available — allowing access',
    });
    return true;
  }

  mainLogger.info('BiometricAuth.promptBiometric.start', { reason });

  try {
    await systemPreferences.promptTouchID(reason);
    mainLogger.info('BiometricAuth.promptBiometric.success', { reason });
    return true;
  } catch (err) {
    mainLogger.warn('BiometricAuth.promptBiometric.failed', {
      reason,
      error: (err as Error).message,
    });
    return false;
  }
}

/**
 * Guard wrapper: prompts biometric and throws if denied.
 * Use in IPC handlers to gate sensitive operations.
 */
export async function requireBiometric(reason: string): Promise<void> {
  const ok = await promptBiometric(reason);
  if (!ok) {
    mainLogger.warn('BiometricAuth.requireBiometric.denied', { reason });
    throw new Error('Biometric authentication required');
  }
}
