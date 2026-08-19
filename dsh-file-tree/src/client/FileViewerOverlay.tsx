/**
 * Chat-area file viewer overlay (shell.overlay entry). Renders the open file
 * tabs and the active tab's content — either the raw file (line numbers +
 * lightweight syntax highlight) or the change diff — as a floating card over
 * the conversation column, so the chat stays visible below. Reads the shared
 * tab store; the right-side tree panel writes it. Renders nothing while no
 * file is open.
 */
import { useEffect, useRef, useState } from 'react';
import type { FileTreeRemote, DiffLine } from './remote.ts';
import { unwrap } from './remote.ts';
import { getSnapshot, setActive, setMode, closeTab, type FileTab } from './store.ts';

export interface FileViewerOverlayProps {
  remote: FileTreeRemote;
  t: (key: string) => string;
}

/** Lightweight line highlight: strings, comments, keywords, numbers. */
function highlight(code: string): string {
  return code
    .replace(/(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/g, '<span class="dshft-tok-c">$1</span>')
    .replace(/(&quot;(?:[^&]|&[^;]*;)*?&quot;|&#39;(?:[^&]|&[^;]*;)*?&#39;)/g, '<span class="dshft-tok-s">$1</span>')
    .replace(/\b(const|let|var|function|return|import|from|export|new|class|extends|if|else|for|while|typeof|interface|type|enum|async|await|default|try|catch|throw|switch|case|break|continue|of|in)\b/g, '<span class="dshft-tok-k">$1</span>')
    .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="dshft-tok-n">$1</span>');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function TabCloseIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

export function FileViewerOverlay({ remote, t }: FileViewerOverlayProps): JSX.Element | null {
  const [, force] = useState(0);
  const version = useRef(0);
  useEffect(() => {
    const { subscribe } = require('./store.ts') as typeof import('./store.ts');
    return subscribe(() => { version.current++; force(version.current); });
  }, []);

  const { tabs, activePath } = getSnapshot();
  if (tabs.length === 0) return null;
  const active = tabs.find((tab) => tab.path === activePath) ?? tabs[0];

  return (
    <div className="dshft-overlay" role="region" aria-label={t('view.tabs')}>
      <div className="dshft-tabs">
        {tabs.map((tab) => (
          <div
            key={tab.path}
            role="tab"
            aria-selected={tab.path === active.path}
            className={tab.path === active.path ? 'dshft-tab dshft-tab-active' : 'dshft-tab'}
            onClick={() => setActive(tab.path)}
          >
            <span className="dshft-tab-name">{tab.name}</span>
            <span
              className="dshft-tab-close"
              role="button"
              aria-label={t('view.close')}
              onClick={(e) => { e.stopPropagation(); closeTab(tab.path); }}
            >
              <TabCloseIcon />
            </span>
          </div>
        ))}
      </div>
      <div className="dshft-viewer">
        <div className="dshft-viewer-toolbar">
          <span className="dshft-viewer-path">{active.path}</span>
          <span className="dshft-viewer-spacer" />
          {active.canDiff ? (
            <span className="dshft-seg">
              <button
                type="button"
                className={active.mode === 'content' ? 'dshft-seg-btn dshft-seg-active' : 'dshft-seg-btn'}
                onClick={() => setMode(active.path, 'content')}
              >
                {t('view.content')}
              </button>
              <button
                type="button"
                className={active.mode === 'diff' ? 'dshft-seg-btn dshft-seg-active' : 'dshft-seg-btn'}
                onClick={() => setMode(active.path, 'diff')}
              >
                {t('view.diff')}
              </button>
            </span>
          ) : null}
        </div>
        <FileBody tab={active} remote={remote} t={t} />
      </div>
    </div>
  );
}

function FileBody({ tab, remote, t }: { tab: FileTab; remote: FileTreeRemote; t: (key: string) => string }): JSX.Element {
  if (tab.mode === 'diff') {
    return <DiffBody path={tab.path} remote={remote} t={t} />;
  }
  const lines = tab.content.split('\n');
  return (
    <div className="dshft-viewer-body dshft-content-body">
      <div className="dshft-lineno">
        {lines.map((_, i) => <div key={i} className="dshft-ln">{i + 1}</div>)}
      </div>
      <pre className="dshft-code" dangerouslySetInnerHTML={{ __html: highlight(escapeHtml(tab.content)) }} />
    </div>
  );
}

/** Diff view: fetch the diff once per tab path, render add/del/ctx rows. */
function DiffBody({ path, remote, t }: { path: string; remote: FileTreeRemote; t: (key: string) => string }): JSX.Element {
  const [lines, setLines] = useState<DiffLine[] | null>(null);
  const [binary, setBinary] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = unwrap(await remote.getFileDiff(path));
        if (!cancelled) {
          setLines(result.lines);
          setBinary(result.binary);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [path, remote]);

  if (error !== null) return <div className="dshft-view-empty">{error}</div>;
  if (lines === null) return <div className="dshft-view-empty">{t('view.loading')}</div>;
  if (binary) return <div className="dshft-view-empty">{t('view.binary')}</div>;
  if (lines.length === 0) return <div className="dshft-view-empty">{t('view.noDiff')}</div>;

  return (
    <div className="dshft-viewer-body dshft-diff-body">
      {lines.map((line, i) => (
        <div key={i} className={`dshft-diff-line dshft-diff-${line.type}`}>
          <span className="dshft-diff-mark">{line.type === 'add' ? '+' : line.type === 'del' ? '−' : ' '}</span>
          <span className="dshft-diff-text">{line.text}</span>
        </div>
      ))}
    </div>
  );
}
