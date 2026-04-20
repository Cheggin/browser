import React, { useState, useEffect } from 'react';
import { StepIndicator } from './StepIndicator';
import { KeyHint } from '../components/base';

const TOTAL_STEPS = 4;
const CURRENT_STEP = 2;

interface ChromeProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
  profilePath: string;
  browserName: string;
  browserPath: string;
  displayName: string;
}

interface ChromeImportResult {
  cookies: { imported: number; failed: number; total: number };
  bookmarks: { imported: number; folders: number };
}

interface ChromeImportProgress {
  phase: string;
  current: number;
  total: number;
}

declare global {
  interface Window {
    chromeImportAPI: {
      listProfiles: () => Promise<ChromeProfile[]>;
      runImport: (profile: ChromeProfile) => Promise<ChromeImportResult>;
      onProgress: (cb: (progress: ChromeImportProgress) => void) => () => void;
    };
  }
}

type ImportState = 'select' | 'importing' | 'done' | 'error';

interface ChromeImportProps {
  onNext: () => void;
  onSkip: () => void;
}

export function ChromeImport({ onNext, onSkip }: ChromeImportProps): React.ReactElement {
  const [profiles, setProfiles] = useState<ChromeProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<ChromeProfile | null>(null);
  const [importState, setImportState] = useState<ImportState>('select');
  const [progress, setProgress] = useState<ChromeImportProgress | null>(null);
  const [result, setResult] = useState<ChromeImportResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failedAvatars, setFailedAvatars] = useState<Set<string>>(new Set());

  useEffect(() => {
    void window.chromeImportAPI.listProfiles().then((p) => {
      setProfiles(p);
      if (p.length === 1) setSelectedProfile(p[0]);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (importState !== 'importing') return;
    const unsub = window.chromeImportAPI.onProgress((p) => setProgress(p));
    return unsub;
  }, [importState]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSkip();
      if (e.key === 'Enter' && importState === 'done') onNext();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onSkip, onNext, importState]);

  async function handleImport(): Promise<void> {
    if (!selectedProfile) return;
    setImportState('importing');
    setProgress({ phase: 'cookies', current: 0, total: 0 });

    try {
      const res = await window.chromeImportAPI.runImport(selectedProfile);
      setResult(res);
      setImportState('done');
    } catch (err) {
      setErrorMsg((err as Error).message);
      setImportState('error');
    }
  }

  function renderProfileList(): React.ReactNode {
    if (loading) {
      return <p className="onboarding-subhead">Detecting browser profiles...</p>;
    }

    if (profiles.length === 0) {
      return (
        <div>
          <p className="onboarding-subhead">No supported Chromium browser profile found.</p>
          <p className="onboarding-subhead" style={{ fontSize: 'var(--font-size-xs)', marginTop: 8 }}>
            You can import later from Settings.
          </p>
        </div>
      );
    }

    return (
      <div role="list" aria-label="Chrome profiles" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {profiles.map((profile) => (
          <button
            key={profile.id}
            type="button"
            role="listitem"
            className="google-service-row"
            onClick={() => setSelectedProfile(profile)}
            style={{
              border: selectedProfile?.id === profile.id
                ? '2px solid var(--color-accent-default)'
                : '2px solid transparent',
              cursor: 'pointer',
              borderRadius: 12,
              padding: '12px 16px',
              background: 'var(--color-bg-elevated)',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              width: '100%',
              textAlign: 'left',
            }}
          >
            {profile.avatarUrl && !failedAvatars.has(profile.id) ? (
              <img
                src={profile.avatarUrl}
                alt=""
                width={36}
                height={36}
                style={{ borderRadius: '50%' }}
                onError={() => setFailedAvatars((prev) => new Set(prev).add(profile.id))}
              />
            ) : (
              <div style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: 'var(--color-bg-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-fg-muted)',
                fontWeight: 600,
                fontSize: 14,
              }}>
                {profile.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <div style={{ color: 'var(--color-fg-default)', fontWeight: 500, fontSize: 14 }}>
                {profile.name}
              </div>
              <div style={{ color: 'var(--color-fg-muted)', fontSize: 12 }}>
                {profile.browserName}
              </div>
              {profile.email && (
                <div style={{ color: 'var(--color-fg-muted)', fontSize: 12 }}>
                  {profile.email}
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
    );
  }

  function renderProgress(): React.ReactNode {
    const phaseName = progress?.phase === 'cookies' ? 'Importing cookies' : 'Importing bookmarks';
    const pct = progress && progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : 0;

    return (
      <div style={{ textAlign: 'center' }}>
        <h1 className="onboarding-headline">Importing from your browser</h1>
        <p className="onboarding-subhead" style={{ marginTop: 8 }}>
          {phaseName}... {pct}%
        </p>
        <div style={{
          marginTop: 24,
          height: 4,
          borderRadius: 2,
          background: 'var(--color-bg-subtle)',
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${pct}%`,
            height: '100%',
            background: 'var(--color-accent-default)',
            transition: 'width 200ms ease',
          }} />
        </div>
      </div>
    );
  }

  function renderDone(): React.ReactNode {
    return (
      <div>
        <h1 className="onboarding-headline">Import complete</h1>
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {result && result.cookies.imported > 0 && (
            <p className="onboarding-subhead">
              {result.cookies.imported.toLocaleString()} cookies imported
            </p>
          )}
          {result && result.bookmarks.imported > 0 && (
            <p className="onboarding-subhead">
              {result.bookmarks.imported.toLocaleString()} bookmarks imported
            </p>
          )}
          {result && result.cookies.imported === 0 && result.bookmarks.imported === 0 && (
            <p className="onboarding-subhead">No data found to import.</p>
          )}
        </div>
        <button
          className="cta-button"
          onClick={onNext}
          type="button"
          style={{ marginTop: 24, width: '100%' }}
        >
          Continue
        </button>
      </div>
    );
  }

  function renderError(): React.ReactNode {
    return (
      <div>
        <h1 className="onboarding-headline">Import failed</h1>
        <p className="onboarding-subhead" style={{ marginTop: 8, color: 'var(--color-status-error)' }}>
          {errorMsg}
        </p>
        <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
          <button
            className="google-btn"
            onClick={() => setImportState('select')}
            type="button"
            style={{ flex: 1 }}
          >
            Try again
          </button>
          <button
            className="cta-button"
            onClick={onSkip}
            type="button"
            style={{ flex: 1 }}
          >
            Skip
          </button>
        </div>
      </div>
    );
  }

  if (importState === 'importing') {
    return (
      <div className="onboarding-root onboarding-fade-in">
        <div className="onboarding-panel-left" style={{ justifyContent: 'center' }}>
          {renderProgress()}
        </div>
      </div>
    );
  }

  if (importState === 'done') {
    return (
      <div className="onboarding-root onboarding-fade-in">
        <div style={{
          position: 'absolute', top: 20, left: 0, right: 0,
          display: 'flex', justifyContent: 'center', zIndex: 10,
        }}>
          <StepIndicator step={CURRENT_STEP} total={TOTAL_STEPS} />
        </div>
        <div className="onboarding-panel-left" style={{ justifyContent: 'center' }}>
          {renderDone()}
        </div>
      </div>
    );
  }

  if (importState === 'error') {
    return (
      <div className="onboarding-root onboarding-fade-in">
        <div className="onboarding-panel-left" style={{ justifyContent: 'center' }}>
          {renderError()}
        </div>
      </div>
    );
  }

  return (
    <div className="onboarding-root onboarding-fade-in">
      <div style={{
        position: 'absolute', top: 20, left: 0, right: 0,
        display: 'flex', justifyContent: 'center', zIndex: 10,
      }}>
        <StepIndicator step={CURRENT_STEP} total={TOTAL_STEPS} />
      </div>

      <div className="onboarding-panel-left">
        <div>
          <h1 className="onboarding-headline">Import from your browser</h1>
          <p className="onboarding-subhead" style={{ marginTop: 8, color: 'var(--color-fg-primary)' }}>
            Copy a Chromium profile into a temporary sandbox, extract cookies over CDP, and bring your bookmarks along.
          </p>
        </div>

        {renderProfileList()}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            className="cta-button"
            onClick={() => void handleImport()}
            type="button"
            disabled={!selectedProfile || profiles.length === 0}
            aria-label="Import selected browser profile"
          >
            {profiles.length === 0 ? 'Skip' : 'Import'}
          </button>
          <button
            className="google-btn"
            onClick={onSkip}
            type="button"
            style={{ width: '100%' }}
          >
            Skip — start fresh
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <KeyHint keys={['Esc']} size="xs" />
              <span className="onboarding-eyebrow" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--color-fg-primary)' }}>
                skip
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
