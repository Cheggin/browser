import React, { useCallback, useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Types (mirrored from main/chrome/ipc.ts — no import across the IPC boundary)
// ---------------------------------------------------------------------------

interface InspectTarget {
  id: string;
  type: string;
  title: string;
  url: string;
  webSocketDebuggerUrl?: string;
  devtoolsFrontendUrl?: string;
  description?: string;
  host: string;
  port: number;
}

interface NetworkTarget {
  host: string;
  port: number;
}

declare const chromeAPI: {
  getPage: () => string;
  getVersionInfo: () => Promise<Record<string, string>>;
  getGpuInfo: () => Promise<Record<string, unknown>>;
  getDownloads: () => Promise<Array<Record<string, unknown>>>;
  getAccessibilityInfo: () => Promise<Record<string, unknown>>;
  getSandboxInfo: () => Promise<Record<string, unknown>>;
  navigateTo: (url: string) => Promise<void>;
  openInternalPage: (page: string) => Promise<void>;
  getInspectTargets: () => Promise<{ targets: InspectTarget[]; networkTargets: NetworkTarget[] }>;
  getNetworkTargets: () => Promise<NetworkTarget[]>;
  addNetworkTarget: (host: string, port: number) => Promise<NetworkTarget[]>;
  removeNetworkTarget: (host: string, port: number) => Promise<NetworkTarget[]>;
};

// ---------------------------------------------------------------------------
// All supported chrome:// pages
// ---------------------------------------------------------------------------

interface ChromePageDef {
  name: string;
  description: string;
  implemented: boolean;
}

const CHROME_PAGES: ChromePageDef[] = [
  { name: 'about', description: 'List of all chrome:// URLs', implemented: true },
  { name: 'version', description: 'Version and build information', implemented: true },
  { name: 'gpu', description: 'Graphics hardware and driver info', implemented: true },
  { name: 'downloads', description: 'Download history and management', implemented: true },
  { name: 'accessibility', description: 'Accessibility status', implemented: true },
  { name: 'sandbox', description: 'Sandbox and security status', implemented: true },
  { name: 'dino', description: 'The classic dinosaur game', implemented: true },
  { name: 'settings', description: 'Browser settings', implemented: true },
  { name: 'history', description: 'Browsing history', implemented: true },
  { name: 'extensions', description: 'Manage browser extensions', implemented: true },
  { name: 'inspect', description: 'DevTools remote debugging targets', implemented: true },
  { name: 'bookmarks', description: 'Bookmark manager', implemented: true },
  { name: 'flags', description: 'Experimental features', implemented: true },
  { name: 'components', description: 'Installed browser components', implemented: true },
  { name: 'net-internals', description: 'Network diagnostic tools', implemented: true },
  { name: 'network-errors', description: 'Network error code reference', implemented: true },
  { name: 'policy', description: 'Browser policies', implemented: true },
  { name: 'webrtc-internals', description: 'WebRTC status and limitations', implemented: true },
  { name: 'media-internals', description: 'Media playback status and limitations', implemented: true },
];

// ---------------------------------------------------------------------------
// Page components
// ---------------------------------------------------------------------------

function AboutPage(): React.ReactElement {
  const handleClick = useCallback((page: string) => {
    chromeAPI.openInternalPage(page);
  }, []);

  return (
    <div className="cp">
      <h1 className="cp__title">Chrome URLs</h1>
      <p className="cp__subtitle">List of internal pages available in The Browser</p>
      <div className="cp__list">
        {CHROME_PAGES.map((p) => (
          <button
            key={p.name}
            className={`cp__link-row ${p.implemented ? '' : 'cp__link-row--stub'}`}
            onClick={() => handleClick(p.name)}
            type="button"
          >
            <span className="cp__link-url">chrome://{p.name}</span>
            <span className="cp__link-desc">{p.description}</span>
            {!p.implemented && <span className="cp__link-badge">planned</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function VersionPage(): React.ReactElement {
  const [info, setInfo] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    chromeAPI.getVersionInfo().then(setInfo).catch(console.error);
  }, []);

  if (!info) return <div className="cp"><div className="cp__loading">Loading...</div></div>;

  const rows: [string, string][] = [
    ['Application', `${info.appName} ${info.appVersion}`],
    ['Electron', info.electronVersion],
    ['Chromium', info.chromeVersion],
    ['Node.js', info.nodeVersion],
    ['V8', info.v8Version],
    ['OS', `${info.osPlatform} ${info.osArch} (${info.osVersion})`],
    ['Locale', info.locale],
    ['User Data', info.userData],
    ['Executable', info.execPath],
  ];

  return (
    <div className="cp">
      <h1 className="cp__title">Version Information</h1>
      <table className="cp__table">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label} className="cp__table-row">
              <td className="cp__table-label">{label}</td>
              <td className="cp__table-value">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GpuPage(): React.ReactElement {
  const [info, setInfo] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    chromeAPI.getGpuInfo().then(setInfo).catch(console.error);
  }, []);

  if (!info) return <div className="cp"><div className="cp__loading">Loading...</div></div>;

  return (
    <div className="cp">
      <h1 className="cp__title">GPU Information</h1>
      {(info as Record<string, unknown>).error ? (
        <p className="cp__error">Failed to retrieve GPU info: {String((info as Record<string, unknown>).error)}</p>
      ) : (
        <pre className="cp__pre">{JSON.stringify(info, null, 2)}</pre>
      )}
    </div>
  );
}

function DownloadsPage(): React.ReactElement {
  const [downloads, setDownloads] = useState<Array<Record<string, unknown>> | null>(null);

  useEffect(() => {
    chromeAPI.getDownloads().then(setDownloads).catch(console.error);
  }, []);

  if (!downloads) return <div className="cp"><div className="cp__loading">Loading...</div></div>;

  if (downloads.length === 0) {
    return (
      <div className="cp">
        <h1 className="cp__title">Downloads</h1>
        <p className="cp__empty">No downloads yet</p>
      </div>
    );
  }

  return (
    <div className="cp">
      <h1 className="cp__title">Downloads</h1>
      <div className="cp__downloads">
        {downloads.map((dl, i) => (
          <div key={String(dl.id ?? i)} className="cp__download-item">
            <div className="cp__download-name">{String(dl.filename ?? 'Unknown')}</div>
            <div className="cp__download-meta">
              <span className={`cp__download-status cp__download-status--${String(dl.status ?? 'unknown')}`}>
                {String(dl.status ?? 'unknown')}
              </span>
              {dl.totalBytes ? (
                <span className="cp__download-size">
                  {formatBytes(Number(dl.receivedBytes ?? 0))} / {formatBytes(Number(dl.totalBytes))}
                </span>
              ) : null}
            </div>
            <div className="cp__download-url">{String(dl.url ?? '')}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function AccessibilityPage(): React.ReactElement {
  const [info, setInfo] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    chromeAPI.getAccessibilityInfo().then(setInfo).catch(console.error);
  }, []);

  if (!info) return <div className="cp"><div className="cp__loading">Loading...</div></div>;

  return (
    <div className="cp">
      <h1 className="cp__title">Accessibility</h1>
      <table className="cp__table">
        <tbody>
          <tr className="cp__table-row">
            <td className="cp__table-label">Accessibility Support</td>
            <td className="cp__table-value">
              {info.accessibilitySupportEnabled ? 'Enabled' : 'Disabled'}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function SandboxPage(): React.ReactElement {
  const [info, setInfo] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    chromeAPI.getSandboxInfo().then(setInfo).catch(console.error);
  }, []);

  if (!info) return <div className="cp"><div className="cp__loading">Loading...</div></div>;

  const rows: [string, string][] = [
    ['Process Sandboxed', String(info.sandboxed)],
    ['Context Isolation', String(info.contextIsolated)],
    ['Node Integration', String(info.nodeIntegration)],
  ];

  return (
    <div className="cp">
      <h1 className="cp__title">Sandbox Status</h1>
      <table className="cp__table">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label} className="cp__table-row">
              <td className="cp__table-label">{label}</td>
              <td className="cp__table-value">
                <span className={`cp__status-dot cp__status-dot--${value}`} />
                {value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DinoPage(): React.ReactElement {
  return (
    <div className="cp cp--dino">
      <div className="dino__container">
        <h1 className="cp__title">No internet</h1>
        <p className="cp__subtitle">Disconnect from the internet to launch the dinosaur game in The Browser.</p>
        <div className="dino__art">
          <pre className="dino__ascii">{`
            __
           / _)
    _.----/ /
   /         /
 _/ (  | (  |
/__.-'|_|--|_|
          `}</pre>
        </div>
        <p className="cp__subtitle">Try disconnecting from the internet and navigating to any page for the real experience.</p>
      </div>
    </div>
  );
}

function FlagsPage(): React.ReactElement {
  return (
    <div className="cp">
      <h1 className="cp__title">Flags</h1>
      <p className="cp__subtitle">Experimental feature controls are limited in The Browser today.</p>
      <div className="cp__stub">
        <p>
          Chromium&apos;s full `chrome://flags` surface is not wired up here yet, so this page does not expose
          searchable experiment toggles, restart-required indicators, or per-flag descriptions.
        </p>
        <p>
          What is available now: a dedicated page that acknowledges the URL, explains the current gap,
          and avoids falling back to a generic unavailable stub.
        </p>
        <button
          type="button"
          className="cp__back-btn"
          onClick={() => chromeAPI.openInternalPage('about')}
        >
          View all chrome:// pages
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// InspectPage — chrome://inspect
// ---------------------------------------------------------------------------

const TARGET_TYPE_LABELS: Record<string, string> = {
  page: 'Page',
  iframe: 'Frame',
  worker: 'Worker',
  service_worker: 'Service Worker',
  browser: 'Browser',
  other: 'Other',
};

function InspectPage(): React.ReactElement {
  const [targets, setTargets] = useState<InspectTarget[]>([]);
  const [networkTargets, setNetworkTargets] = useState<NetworkTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add target form state
  const [addHost, setAddHost] = useState('');
  const [addPort, setAddPort] = useState('');
  const [addError, setAddError] = useState<string | null>(null);

  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const result = await chromeAPI.getInspectTargets();
      setTargets(result.targets);
      setNetworkTargets(result.networkTargets);
      setError(null);
    } catch (err) {
      console.error('InspectPage.refresh.failed', err);
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    refreshIntervalRef.current = setInterval(() => { void refresh(); }, 2000);
    return () => {
      if (refreshIntervalRef.current !== null) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [refresh]);

  const handleRemoveTarget = useCallback(async (host: string, port: number) => {
    const updated = await chromeAPI.removeNetworkTarget(host, port);
    setNetworkTargets(updated);
    void refresh();
  }, [refresh]);

  const handleAddTarget = useCallback(async () => {
    setAddError(null);
    const host = addHost.trim() || 'localhost';
    const portNum = parseInt(addPort, 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      setAddError('Port must be a number between 1 and 65535');
      return;
    }
    const updated = await chromeAPI.addNetworkTarget(host, portNum);
    setNetworkTargets(updated);
    setAddHost('');
    setAddPort('');
    void refresh();
  }, [addHost, addPort, refresh]);

  const handleInspect = useCallback((target: InspectTarget) => {
    if (target.devtoolsFrontendUrl) {
      chromeAPI.navigateTo(target.devtoolsFrontendUrl).catch(console.error);
    } else if (target.webSocketDebuggerUrl) {
      const devtoolsUrl = `devtools://devtools/bundled/inspector.html?ws=${encodeURIComponent(target.webSocketDebuggerUrl.replace(/^ws:\/\//, ''))}`;
      chromeAPI.navigateTo(devtoolsUrl).catch(console.error);
    }
  }, []);

  // Group targets by host:port
  const targetsByEndpoint = new Map<string, InspectTarget[]>();
  for (const t of targets) {
    const key = `${t.host}:${t.port}`;
    if (!targetsByEndpoint.has(key)) targetsByEndpoint.set(key, []);
    targetsByEndpoint.get(key)!.push(t);
  }

  return (
    <div className="cp cp--inspect">
      <h1 className="cp__title">Inspect</h1>
      <p className="cp__subtitle">Remote debugging targets discovered on configured network endpoints</p>

      {error && <p className="cp__error">{error}</p>}

      {/* Network targets configuration */}
      <section className="insp__section">
        <h2 className="insp__section-title">Network Targets</h2>
        <p className="insp__section-desc">
          Discover and inspect pages on the following TCP/IP endpoints:
        </p>
        <div className="insp__target-list">
          {networkTargets.map((nt) => (
            <div key={`${nt.host}:${nt.port}`} className="insp__network-row">
              <span className="insp__network-addr">{nt.host}:{nt.port}</span>
              <button
                type="button"
                className="insp__remove-btn"
                onClick={() => { void handleRemoveTarget(nt.host, nt.port); }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <div className="insp__add-form">
          <input
            type="text"
            className="insp__input"
            placeholder="Host (default: localhost)"
            value={addHost}
            onChange={(e) => setAddHost(e.target.value)}
          />
          <input
            type="number"
            className="insp__input insp__input--port"
            placeholder="Port"
            value={addPort}
            onChange={(e) => setAddPort(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { void handleAddTarget(); } }}
            min={1}
            max={65535}
          />
          <button
            type="button"
            className="insp__add-btn"
            onClick={() => { void handleAddTarget(); }}
          >
            Add
          </button>
        </div>
        {addError && <p className="insp__add-error">{addError}</p>}
      </section>

      {/* Discovered targets */}
      <section className="insp__section">
        <div className="insp__section-header">
          <h2 className="insp__section-title">Pages</h2>
          <button
            type="button"
            className="insp__refresh-btn"
            onClick={() => { void refresh(); }}
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {targets.length === 0 && !loading && (
          <p className="cp__empty">
            No debuggable targets found. Make sure the target is running with remote debugging enabled.
          </p>
        )}

        {loading && targets.length === 0 && (
          <div className="cp__loading">Scanning endpoints...</div>
        )}

        {Array.from(targetsByEndpoint.entries()).map(([endpoint, endpointTargets]) => (
          <div key={endpoint} className="insp__endpoint-group">
            <div className="insp__endpoint-label">{endpoint}</div>
            <div className="insp__cards">
              {endpointTargets.map((t) => (
                <div key={`${t.host}:${t.port}:${t.id}`} className="insp__card">
                  <div className="insp__card-header">
                    <span className="insp__card-type">
                      {TARGET_TYPE_LABELS[t.type] ?? t.type}
                    </span>
                    {t.webSocketDebuggerUrl || t.devtoolsFrontendUrl ? (
                      <button
                        type="button"
                        className="insp__inspect-btn"
                        onClick={() => handleInspect(t)}
                      >
                        inspect
                      </button>
                    ) : (
                      <span className="insp__inspect-unavailable">not inspectable</span>
                    )}
                  </div>
                  <div className="insp__card-title">{t.title || '(untitled)'}</div>
                  <div className="insp__card-url">{t.url}</div>
                  {t.description && (
                    <div className="insp__card-desc">{t.description}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

function MediaInternalsPage(): React.ReactElement {
  return (
    <div className="cp">
      <h1 className="cp__title">Media Internals</h1>
      <p className="cp__subtitle">Playback diagnostics are limited in The Browser today.</p>
      <div className="cp__stub">
        <p>
          Chromium&apos;s live media pipeline inspector is not wired up here yet, so this page does not expose
          per-player events, decoder graphs, or stream logs.
        </p>
        <p>
          What is available now: a dedicated page that confirms the URL exists and explains the current gap
          instead of sending you to a generic unavailable screen.
        </p>
        <button
          type="button"
          className="cp__back-btn"
          onClick={() => chromeAPI.openInternalPage('about')}
        >
          View all chrome:// pages
        </button>
      </div>
    </div>
  );
}

function WebRtcInternalsPage(): React.ReactElement {
  return (
    <div className="cp">
      <h1 className="cp__title">WebRTC Internals</h1>
      <p className="cp__subtitle">Connection diagnostics are limited in The Browser today.</p>
      <div className="cp__stub">
        <p>
          Chromium&apos;s full WebRTC inspector is not wired up here yet, so this page does not expose
          peer-connection timelines, RTP stats dumps, or downloadable event logs.
        </p>
        <p>
          What is available now: a dedicated page that acknowledges the URL, explains the current gap,
          and avoids pretending the complete diagnostics stack already exists.
        </p>
        <button
          type="button"
          className="cp__back-btn"
          onClick={() => chromeAPI.openInternalPage('about')}
        >
          View all chrome:// pages
        </button>
      </div>
    </div>
  );
}

function PolicyPage(): React.ReactElement {
  return (
    <div className="cp">
      <h1 className="cp__title">Policy</h1>
      <p className="cp__subtitle">Enterprise policy inspection is limited in The Browser today.</p>
      <div className="cp__stub">
        <p>
          Chromium&apos;s policy viewer is not connected here yet, so this page does not expose active policy
          values, source precedence, or reload controls.
        </p>
        <p>
          What is available now: a dedicated page that acknowledges `chrome://policy`, explains the current
          limitation, and avoids falling back to a generic unavailable stub.
        </p>
        <button
          type="button"
          className="cp__back-btn"
          onClick={() => chromeAPI.openInternalPage('about')}
        >
          View all chrome:// pages
        </button>
      </div>
    </div>
  );
}

function NetworkErrorsPage(): React.ReactElement {
  return (
    <div className="cp">
      <h1 className="cp__title">Network Errors</h1>
      <p className="cp__subtitle">Network error code coverage is limited in The Browser today.</p>
      <div className="cp__stub">
        <p>
          Chromium&apos;s full `chrome://network-errors` reference is not mirrored here yet, so this page does not
          expose the complete net error catalog or the upstream debugging notes that ship with Chrome.
        </p>
        <p>
          What is available now: a dedicated page that acknowledges the URL, explains the current gap,
          and avoids falling back to a generic unavailable stub.
        </p>
        <button
          type="button"
          className="cp__back-btn"
          onClick={() => chromeAPI.openInternalPage('about')}
        >
          View all chrome:// pages
        </button>
      </div>
    </div>
  );
}

function NetInternalsPage(): React.ReactElement {
  return (
    <div className="cp">
      <h1 className="cp__title">Net Internals</h1>
      <p className="cp__subtitle">Network diagnostics are limited in The Browser today.</p>
      <div className="cp__stub">
        <p>
          Chromium&apos;s full `chrome://net-internals` tooling is not wired up here yet, so this page does not
          expose live socket pools, DNS events, proxy resolution traces, or exportable net logs.
        </p>
        <p>
          What is available now: a dedicated page that acknowledges the URL, explains the current gap,
          and avoids pretending the complete diagnostics stack already exists.
        </p>
        <button
          type="button"
          className="cp__back-btn"
          onClick={() => chromeAPI.openInternalPage('about')}
        >
          View all chrome:// pages
        </button>
      </div>
    </div>
  );
}

function ComponentsPage(): React.ReactElement {
  return (
    <div className="cp">
      <h1 className="cp__title">Components</h1>
      <p className="cp__subtitle">Installed component details are limited in The Browser today.</p>
      <div className="cp__stub">
        <p>
          Chromium&apos;s full `chrome://components` viewer is not wired up here yet, so this page does not
          expose installed component versions, last update checks, or on-demand update controls.
        </p>
        <p>
          What is available now: a dedicated page that acknowledges the URL, explains the current gap,
          and avoids falling back to a generic unavailable stub.
        </p>
        <button
          type="button"
          className="cp__back-btn"
          onClick={() => chromeAPI.openInternalPage('about')}
        >
          View all chrome:// pages
        </button>
      </div>
    </div>
  );
}

function StubPage({ name }: { name: string }): React.ReactElement {
  const def = CHROME_PAGES.find((p) => p.name === name);
  return (
    <div className="cp">
      <h1 className="cp__title">chrome://{name}</h1>
      <p className="cp__subtitle">{def?.description ?? 'Internal page'}</p>
      <div className="cp__stub">
        <p>This page is not yet available in The Browser.</p>
        <button
          type="button"
          className="cp__back-btn"
          onClick={() => chromeAPI.openInternalPage('about')}
        >
          View all chrome:// pages
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export function ChromePages(): React.ReactElement {
  const page = chromeAPI.getPage();
  console.log('ChromePages.render', { page });

  switch (page) {
    case 'about':
      return <AboutPage />;
    case 'version':
      return <VersionPage />;
    case 'gpu':
      return <GpuPage />;
    case 'downloads':
      return <DownloadsPage />;
    case 'accessibility':
      return <AccessibilityPage />;
    case 'sandbox':
      return <SandboxPage />;
    case 'dino':
      return <DinoPage />;
    case 'flags':
      return <FlagsPage />;
    case 'inspect':
      return <InspectPage />;
    case 'webrtc-internals':
      return <WebRtcInternalsPage />;
    case 'media-internals':
      return <MediaInternalsPage />;
    case 'policy':
      return <PolicyPage />;
    case 'network-errors':
      return <NetworkErrorsPage />;
    case 'net-internals':
      return <NetInternalsPage />;
    case 'components':
      return <ComponentsPage />;
    default:
      return <StubPage name={page} />;
  }
}
