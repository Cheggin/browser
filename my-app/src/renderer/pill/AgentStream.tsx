/**
 * AgentStream — streaming log shown while an hl agent task runs.
 *
 * Entries are reduced from the hl event stream (thinking / tool_call /
 * tool_result / done / error). Latest-first rendering would be natural but
 * user expectation in a dynamic-island-style log is top-down-append, so we
 * show oldest → newest and the container scroll-snaps to the bottom.
 */

import React, { useEffect, useRef } from 'react';

export type StreamEntry =
  | { kind: 'thinking'; text: string }
  | { kind: 'tool'; name: string; argsPreview: string; ok?: boolean; resultPreview?: string; ms?: number };

export interface HlEventLike {
  type: 'thinking' | 'tool_call' | 'tool_result' | 'done' | 'error' | 'task_started';
  text?: string;
  name?: string;
  args?: unknown;
  preview?: string;
  ok?: boolean;
  ms?: number;
  summary?: string;
  message?: string;
  iteration?: number;
}

const MAX_ENTRIES = 60;

function safePreview(x: unknown, max = 80): string {
  try {
    const s = typeof x === 'string' ? x : JSON.stringify(x);
    return s.length > max ? s.slice(0, max) + '…' : s;
  } catch { return String(x).slice(0, max); }
}

function renderInlineMarkdown(text: string): React.ReactElement {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|`(.+?)`|\*(.+?)\*)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[2]) parts.push(<strong key={key++}>{match[2]}</strong>);
    else if (match[3]) parts.push(<code key={key++} className="pill-stream-inline-code">{match[3]}</code>);
    else if (match[4]) parts.push(<em key={key++}>{match[4]}</em>);
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

function ThinkingBlock({ text }: { text: string }): React.ReactElement {
  const lines = text.split('\n');
  return (
    <div className="pill-stream-entry pill-stream-entry--thinking">
      {lines.map((line, i) => {
        if (line.startsWith('- ') || line.startsWith('* ')) {
          return <div key={i} className="pill-stream-md-li">{renderInlineMarkdown(line.slice(2))}</div>;
        }
        return <span key={i}>{renderInlineMarkdown(line)}{i < lines.length - 1 ? '\n' : ''}</span>;
      })}
    </div>
  );
}

/** Reducer: push one hl event into the running entry list. */
export function applyHlEvent(entries: StreamEntry[], e: HlEventLike): StreamEntry[] {
  if (e.type === 'thinking' && e.text) {
    const entry: StreamEntry = { kind: 'thinking', text: e.text };
    return [...entries, entry].slice(-MAX_ENTRIES);
  }
  if (e.type === 'tool_call' && e.name) {
    const entry: StreamEntry = { kind: 'tool', name: e.name, argsPreview: safePreview(e.args) };
    return [...entries, entry].slice(-MAX_ENTRIES);
  }
  if (e.type === 'tool_result' && e.name) {
    const out = entries.slice();
    for (let i = out.length - 1; i >= 0; i--) {
      const en = out[i];
      if (en.kind === 'tool' && en.name === e.name && en.ok === undefined) {
        out[i] = { ...en, ok: e.ok ?? false, resultPreview: e.preview ?? '', ms: e.ms };
        return out;
      }
    }
    return entries;
  }
  return entries;
}

interface AgentStreamProps {
  entries: StreamEntry[];
  iteration: number;
  maxIterations: number;
  onStop: () => void;
}

export function AgentStream({ entries, iteration, maxIterations, onStop }: AgentStreamProps): React.ReactElement {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries.length]);

  return (
    <div className="pill-stream" data-testid="agent-stream">
      <div className="pill-stream-header">
        <span className="pill-spinner" aria-hidden="true">◐</span>
        <span>Agent running</span>
        <span className="pill-stream-step">{iteration}/{maxIterations}</span>
        <button type="button" className="pill-stream-stop" onClick={onStop} aria-label="Stop agent">Stop</button>
      </div>
      <div className="pill-stream-log" ref={scrollRef}>
        {entries.length === 0 && (
          <div className="pill-stream-entry pill-stream-entry--thinking">Starting…</div>
        )}
        {entries.map((en, i) => {
          if (en.kind === 'thinking') {
            return <ThinkingBlock key={i} text={en.text} />;
          }
          const status = en.ok === undefined ? '⋯' : en.ok ? '✓' : '✗';
          return (
            <div key={i} className={`pill-stream-entry pill-stream-entry--tool ${en.ok === false ? 'is-error' : ''}`}>
              <div className="pill-stream-tool-row">
                <span className="pill-stream-tool-status">{status}</span>
                <span className="pill-stream-tool-name">{en.name}</span>
                {typeof en.ms === 'number' && <span className="pill-stream-tool-ms">{en.ms}ms</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
