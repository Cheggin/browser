/**
 * Onboarding preload — contextBridge API for the onboarding renderer.
 *
 * Exposes a minimal, typed API surface:
 *   window.onboardingAPI.setAgentName(name)
 *   window.onboardingAPI.startOAuth(scopes)
 *   window.onboardingAPI.onOAuthCallback(cb)
 *   window.onboardingAPI.completeOnboarding(payload)
 *   window.onboardingAPI.getAgentName()
 *
 * All IPC channels are namespaced under 'onboarding:' to avoid collisions.
 *
 * D2 logging: preload logs every IPC call at debug level (scrubbed of tokens).
 */

import { contextBridge, ipcRenderer } from 'electron';
import type { GoogleOAuthScope, AccountInfo } from '../shared/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OAuthCallbackPayload {
  success: boolean;
  account?: AccountInfo;
  error?: string;
}

export interface OnboardingCompletePayload {
  agent_name: string;
  account: AccountInfo;
  oauth_scopes: GoogleOAuthScope[];
}

export interface OnboardingAPI {
  /** Persist the chosen agent name to AccountStore */
  setAgentName: (name: string) => Promise<void>;

  /** Retrieve the agent name from AccountStore (null if not yet set) */
  getAgentName: () => Promise<string | null>;

  /**
   * Initiate Google OAuth flow.
   * Opens system browser; result arrives via onOAuthCallback.
   */
  startOAuth: (scopes: GoogleOAuthScope[]) => Promise<void>;

  /** Subscribe to the OAuth callback result (one-time) */
  onOAuthCallback: (cb: (payload: OAuthCallbackPayload) => void) => () => void;

  /** Fire onboarding-complete event; main closes onboarding window, opens shell */
  completeOnboarding: (payload: OnboardingCompletePayload) => Promise<void>;
}

// ---------------------------------------------------------------------------
// contextBridge exposure
// ---------------------------------------------------------------------------

const api: OnboardingAPI = {
  setAgentName: async (name: string): Promise<void> => {
    console.debug('[onboarding-preload] setAgentName', { nameLength: name.length });
    await ipcRenderer.invoke('onboarding:set-agent-name', name);
  },

  getAgentName: async (): Promise<string | null> => {
    console.debug('[onboarding-preload] getAgentName');
    return ipcRenderer.invoke('onboarding:get-agent-name') as Promise<string | null>;
  },

  startOAuth: async (scopes: GoogleOAuthScope[]): Promise<void> => {
    console.debug('[onboarding-preload] startOAuth', { scopeCount: scopes.length });
    await ipcRenderer.invoke('onboarding:start-oauth', scopes);
  },

  onOAuthCallback: (cb: (payload: OAuthCallbackPayload) => void): (() => void) => {
    console.debug('[onboarding-preload] onOAuthCallback registered');
    const handler = (_event: Electron.IpcRendererEvent, payload: OAuthCallbackPayload) => {
      console.debug('[onboarding-preload] oauth-callback received', {
        success: payload.success,
        hasAccount: !!payload.account,
        error: payload.error,
      });
      cb(payload);
    };
    ipcRenderer.on('oauth-callback', handler);
    // Return unsubscribe
    return () => {
      ipcRenderer.removeListener('oauth-callback', handler);
    };
  },

  completeOnboarding: async (payload: OnboardingCompletePayload): Promise<void> => {
    console.debug('[onboarding-preload] completeOnboarding', {
      agentName: payload.agent_name,
      email: payload.account.email,
      scopeCount: payload.oauth_scopes.length,
    });
    await ipcRenderer.invoke('onboarding:complete', payload);
  },
};

contextBridge.exposeInMainWorld('onboardingAPI', api);

// Also expose a minimal type hint for TypeScript in renderer files
// (augment Window via the global declaration below, imported in onboarding index)

// ---------------------------------------------------------------------------
// Chrome Import API
// ---------------------------------------------------------------------------

export interface ChromeProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
  profilePath: string;
}

export interface ChromeImportProgress {
  phase: string;
  current: number;
  total: number;
}

export interface ChromeImportResult {
  cookies: { imported: number; failed: number; total: number };
  bookmarks: { imported: number; folders: number };
}

export interface ChromeImportAPI {
  listProfiles: () => Promise<ChromeProfile[]>;
  runImport: (profilePath: string) => Promise<ChromeImportResult>;
  onProgress: (cb: (progress: ChromeImportProgress) => void) => () => void;
}

const chromeImportAPI: ChromeImportAPI = {
  listProfiles: async (): Promise<ChromeProfile[]> => {
    console.debug('[onboarding-preload] chrome-import:list-profiles');
    return ipcRenderer.invoke('chrome-import:list-profiles') as Promise<ChromeProfile[]>;
  },

  runImport: async (profilePath: string): Promise<ChromeImportResult> => {
    console.debug('[onboarding-preload] chrome-import:run', { profilePath });
    return ipcRenderer.invoke('chrome-import:run', profilePath) as Promise<ChromeImportResult>;
  },

  onProgress: (cb: (progress: ChromeImportProgress) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: ChromeImportProgress) => {
      cb(progress);
    };
    ipcRenderer.on('chrome-import:progress', handler);
    return () => ipcRenderer.removeListener('chrome-import:progress', handler);
  },
};

contextBridge.exposeInMainWorld('chromeImportAPI', chromeImportAPI);
