/**
 * Right-side file tree panel (details column occupant). Renders the current
 * conversation's workspace tree with git-changed markers, an "only changed"
 * filter, and a refresh action. Clicking a file reads it, opens a center
 * viewer tab (shared store), and switches the conversation to the "文件" view.
 *
 * On mount it re-pins the host gateway root to the current session's
 * workspace directory (SessionSummary.cwd); without a session it falls back
 * to the gateway's configured root. The panel is registered at priority -1
 * into the single-seat `details` slot, so while it lives the tool-details
 * panel yields and closing the panel restores it.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FileTreeRemote, FileEntry, StatusValue } from './remote.ts';
import { unwrap } from './remote.ts';
import { openTab, resetAll } from './store.ts';

/** Structural view of the standard useSessions selector hook (details kit). */
type SessionsHook = <S>(
  sel: (s: { current?: string; byId: Record<string, { cwd?: string }> }) => S,
  eq?: (a: S, b: S) => boolean,
) => S;

export interface FileTreePanelProps {
  sessionId: string;
  useSessions: SessionsHook;
  /** Close the details panel (layout orchestration, injected). */
  closeDetails: () => void;
  /** The mounted remote face (ctx.remote.fileTree after $mount), injected. */
  remote: FileTreeRemote;
  /** Bound locale translator for this plugin's dictionary. */
  t: (key: string) => string;
}

/** One lazily-loaded tree node (path is root-relative, '' = root dir). */
interface TreeNode {
  path: string;
  name: string;
  type: 'file' | 'directory' | 'other';
  children?: TreeNode[];
  loaded?: boolean;
}

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

function FolderIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" className="dshft-icon dshft-icon-folder" aria-hidden>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

function FileIcon({ name }: { name: string }): JSX.Element {
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  const color = ({ ts: '#5B9BD5', css: '#C586C0', json: '#D4A017', md: '#4A90D9', yaml: '#CB3837' } as Record<string, string>)[ext] ?? '#8B949E';
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke={color} strokeWidth="1.7" className="dshft-icon" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6" />
    </svg>
  );
}

function CloseIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

function RefreshIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
    </svg>
  );
}

function toNode(parent: string, entry: FileEntry): TreeNode {
  return {
    path: parent === '' ? entry.name : `${parent}/${entry.name}`,
    name: entry.name,
    type: entry.type,
  };
}

export function FileTreePanel({ sessionId, useSessions, closeDetails, remote, t }: FileTreePanelProps): JSX.Element | null {
  const [root, setRoot] = useState<string | null>(null);
  const [rootError, setRootError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusValue | null>(null);
  const [tree, setTree] = useState<TreeNode[] | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Current conversation's workspace directory, if any.
  const sessionCwd = useSessions((s) => (s.current !== undefined ? s.byId[s.current]?.cwd : undefined));

  // Re-pin the gateway root to the active session's workspace; load status + tree.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (sessionCwd !== undefined) {
          try {
            await unwrap(await remote.setRoot(sessionCwd));
          } catch {
            // setRoot unavailable (host not restarted yet): keep the configured root.
          }
        }
        const { path } = unwrap(await remote.getRoot());
        if (cancelled) return;
        setRoot(path);
        setRootError(null);
        const st = unwrap(await remote.getStatus());
        if (cancelled) return;
        setStatus(st);
        setExpanded(new Set());
        setTree(null);
        const listing = unwrap(await remote.listDir('/'));
        if (cancelled) return;
        setTree(listing.entries.map((e) => toNode('', e)));
      } catch (error) {
        if (!cancelled) setRootError(error instanceof Error ? error.message : String(error));
      }
    })();
    return () => { cancelled = true; };
  }, [remote, sessionCwd]);

  // Reset editor state when the panel unmounts.
  useEffect(() => () => {
    resetAll();
  }, []);

  // Derived change sets from the status entries.
  const changedPaths = useMemo(() => {
    const set = new Set<string>();
    if (status?.entries) for (const e of status.entries) set.add(e.path);
    return set;
  }, [status]);

  const changedDirs = useMemo(() => {
    const dirs = new Set<string>();
    for (const p of changedPaths) {
      let rest = p;
      let idx = rest.lastIndexOf('/');
      while (idx !== -1) {
        dirs.add(rest.slice(0, idx));
        rest = rest.slice(0, idx);
        idx = rest.lastIndexOf('/');
      }
    }
    return dirs;
  }, [changedPaths]);

  const refresh = useCallback(async () => {
    if (root === null) return;
    try {
      const st = unwrap(await remote.getStatus());
      setStatus(st);
      const listing = unwrap(await remote.listDir('/'));
      setTree(listing.entries.map((e) => toNode('', e)));
      setNotice(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }, [remote, root]);

  /** Expand/collapse a directory, lazily loading its children. */
  const toggleDir = useCallback(async (node: TreeNode) => {
    if (!node.loaded && node.children === undefined) {
      try {
        const listing = unwrap(await remote.listDir(node.path === '' ? '/' : node.path));
        node.children = listing.entries.map((e) => toNode(node.path, e));
        node.loaded = true;
        forceTreeRefresh();
      } catch (error) {
        setNotice(error instanceof Error ? error.message : String(error));
        return;
      }
    }
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(node.path)) next.delete(node.path); else next.add(node.path);
      return next;
    });
  }, [remote]);

  // Tree nodes are mutated in place by lazy loading; a version bump re-renders.
  const [, setTreeVersion] = useState(0);
  const forceTreeRefresh = useCallback(() => setTreeVersion((v) => v + 1), []);

  /** Open a file: read content + diff availability, open a viewer tab, switch view. */
  const openFile = useCallback(async (path: string) => {
    setSelected(path);
    try {
      const value = unwrap(await remote.readText(path));
      let canDiff = false;
      try {
        const diff = unwrap(await remote.getFileDiff(path));
        canDiff = diff.lines.length > 0;
      } catch {
        canDiff = false;
      }
      openTab({ path, name: path.split('/').pop() ?? path, content: value.content, canDiff });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }, [remote]);

  /** Render one tree row; directories recurse into children when expanded. */
  const renderRow = (node: TreeNode, depth: number): JSX.Element => {
    const isDir = node.type === 'directory';
    const open = expanded.has(node.path);
    const changed = isDir ? changedDirs.has(node.path) : changedPaths.has(node.path);
    const shown = onlyChanged ? changed : true;
    if (!shown) return <></>;
    return (
      <div key={node.path}>
        <div
          className={cx('dshft-row', selected === node.path && 'dshft-row-selected')}
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={() => { if (isDir) void toggleDir(node); else void openFile(node.path); }}
          title={node.path}
        >
          <span className={cx('dshft-twist', !isDir && 'dshft-twist-leaf', open && 'dshft-twist-open')}>
            {isDir ? (
              <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M9 6l6 6-6 6" /></svg>
            ) : null}
          </span>
          <span className="dshft-t-icon">{isDir ? <FolderIcon /> : <FileIcon name={node.name} />}</span>
          <span className="dshft-t-name">{node.name}</span>
          {changed ? <span className="dshft-changed-dot" title={t('changed.tip')} /> : null}
        </div>
        {isDir && open && node.children?.map((child) => renderRow(child, depth + 1))}
      </div>
    );
  };

  let totalCount = 0;
  if (tree) {
    const walk = (nodes: TreeNode[]) => { for (const n of nodes) { totalCount++; if (n.children) walk(n.children); } };
    walk(tree);
  }

  return (
    <div className="dshft-panel">
      <div className="dshft-header">
        <div className="dshft-title">{t('panel.title')}</div>
        <div className="dshft-header-right">
          {status?.branch ? <span className="dshft-branch">{status.branch}</span> : null}
          <button type="button" className="dshft-icon-btn" onClick={closeDetails} aria-label={t('panel.close')} title={t('panel.close')}>
            <CloseIcon />
          </button>
        </div>
      </div>
      <div className="dshft-path" title={root ?? ''}>{shortenPath(root)}</div>
      <div className="dshft-toolbar">
        <button type="button" className="dshft-tool-btn" onClick={() => void refresh()} title={t('panel.refresh')}>
          <RefreshIcon />{t('panel.refresh')}
        </button>
        <label className="dshft-only-changed">
          <input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} />
          {t('panel.onlyChanged')}
        </label>
      </div>
      <div className="dshft-tree">
        {rootError !== null ? (
          <div className="dshft-empty">{rootError}</div>
        ) : tree === null ? (
          <div className="dshft-empty">{t('panel.loading')}</div>
        ) : tree.length === 0 ? (
          <div className="dshft-empty">{t('panel.empty')}</div>
        ) : (
          tree.map((node) => renderRow(node, 0))
        )}
      </div>
      <div className="dshft-statusbar">
        <span>{t('panel.count')} <b>{totalCount}</b></span>
        <span className="dshft-status-changed">{t('panel.changed')} <b>{changedPaths.size}</b></span>
      </div>
      {notice !== null ? <div className="dshft-notice">{notice}</div> : null}
    </div>
  );
}

function shortenPath(root: string | null): string {
  if (root === null) return '';
  const home = '/Users/';
  if (root.startsWith(home)) return `~${root.slice(home.length - 1)}`;
  return root;
}
