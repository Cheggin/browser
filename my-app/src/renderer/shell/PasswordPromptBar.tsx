/**
 * PasswordPromptBar — Chrome-parity save-password infobar below the toolbar.
 *
 * Shows after a form with a password field is submitted. The user can:
 *   - Save the credentials
 *   - Never save for this site
 *   - Dismiss (x button)
 */

import React, { useCallback, useEffect, useState } from 'react';
import { usePopupLayer } from './PopupLayerContext';

interface PasswordPromptData {
  tabId: string;
  origin: string;
  username: string;
  password: string;
}

declare const electronAPI: {
  on: {
    passwordFormDetected: (
      cb: (payload: PasswordPromptData) => void,
    ) => () => void;
  };
  passwords: {
    save: (payload: { origin: string; username: string; password: string }) => Promise<unknown>;
    isNeverSave: (origin: string) => Promise<boolean>;
    addNeverSave: (origin: string) => Promise<void>;
  };
};

interface PasswordPromptBarProps {
  activeTabId: string | null;
}

export function PasswordPromptBar({ activeTabId }: PasswordPromptBarProps): React.ReactElement | null {
  const [prompts, setPrompts] = useState<PasswordPromptData[]>([]);

  useEffect(() => {
    const unsub = electronAPI.on.passwordFormDetected(async (data) => {
      console.log('[PasswordPromptBar] Detected:', data.origin, data.username);

      const isNever = await electronAPI.passwords.isNeverSave(data.origin);
      if (isNever) {
        console.log('[PasswordPromptBar] Skipping — origin is in never-save list:', data.origin);
        return;
      }

      setPrompts((prev) => {
        const existing = prev.find(
          (p) => p.origin === data.origin && p.username === data.username,
        );
        if (existing) {
          return prev.map((p) =>
            p.origin === data.origin && p.username === data.username
              ? { ...p, password: data.password, tabId: data.tabId }
              : p,
          );
        }
        return [...prev, data];
      });
    });

    return () => { unsub(); };
  }, []);

  const visiblePrompts = prompts.filter((p) => p.tabId === activeTabId);
  const current = visiblePrompts[0] ?? null;

  const handleSave = useCallback(async (prompt: PasswordPromptData) => {
    console.log('[PasswordPromptBar] Saving credentials for:', prompt.origin);
    await electronAPI.passwords.save({
      origin: prompt.origin,
      username: prompt.username,
      password: prompt.password,
    });
    setPrompts((prev) => prev.filter((p) => p !== prompt));
  }, []);

  const handleNever = useCallback(async (prompt: PasswordPromptData) => {
    console.log('[PasswordPromptBar] Never save for:', prompt.origin);
    await electronAPI.passwords.addNeverSave(prompt.origin);
    setPrompts((prev) => prev.filter((p) => p.origin !== prompt.origin));
  }, []);

  const handleDismiss = useCallback((prompt: PasswordPromptData) => {
    setPrompts((prev) => prev.filter((p) => p !== prompt));
  }, []);

  usePopupLayer({
    id: 'password-prompt-bar',
    type: 'bar',
    height: 48,
    onDismiss: () => { if (current) handleDismiss(current); },
    isOpen: visiblePrompts.length > 0,
  });

  if (!current) return null;

  let displayOrigin = current.origin;
  try {
    displayOrigin = new URL(current.origin).hostname;
  } catch { /* use raw */ }

  return (
    <div
      className="password-prompt-bar"
      role="alertdialog"
      aria-label={`Save password for ${displayOrigin}`}
    >
      <div className="password-prompt-bar__content">
        <svg
          className="password-prompt-bar__icon"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>

        <span className="password-prompt-bar__message">
          Save password for <strong>{displayOrigin}</strong>
          {current.username && (
            <> as <strong>{current.username}</strong></>
          )}
          ?
        </span>
      </div>

      <div className="password-prompt-bar__actions">
        <button
          type="button"
          className="password-prompt-bar__btn password-prompt-bar__btn--secondary"
          onClick={() => void handleNever(current)}
        >
          Never for this site
        </button>
        <button
          type="button"
          className="password-prompt-bar__btn password-prompt-bar__btn--primary"
          onClick={() => void handleSave(current)}
        >
          Save
        </button>
        <button
          type="button"
          className="password-prompt-bar__dismiss"
          onClick={() => handleDismiss(current)}
          aria-label="Dismiss save password prompt"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
            <path
              d="M1 1l8 8M9 1L1 9"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
