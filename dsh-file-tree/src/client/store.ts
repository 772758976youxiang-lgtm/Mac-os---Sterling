/**
 * Shared editor state for the file viewer: open tabs, active tab, and each
 * tab's view mode (content / diff). Module-level store — the details panel
 * writes (open/close/switch), the center-column view reads. A small
 * subscription notifies the view; the panel resets everything on unmount.
 */

export interface FileTab {
  /** Workspace-relative path (also the tab key). */
  path: string;
  name: string;
  content: string;
  /** Whether a diff is available for this file. */
  canDiff: boolean;
  mode: 'content' | 'diff';
}

export interface FileViewSnapshot {
  tabs: readonly FileTab[];
  activePath: string | null;
}

let tabs: FileTab[] = [];
let activePath: string | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const fn of listeners) fn();
}

/** Open (or focus) one tab. */
export function openTab(tab: Omit<FileTab, 'mode'>): void {
  const existing = tabs.find((t) => t.path === tab.path);
  if (existing !== undefined) {
    existing.content = tab.content;
    existing.canDiff = tab.canDiff;
    activePath = tab.path;
    emit();
    return;
  }
  tabs = [...tabs, { ...tab, mode: tab.canDiff ? 'diff' : 'content' }];
  activePath = tab.path;
  emit();
}

/** Close one tab; the last tab falling back to none. */
export function closeTab(path: string): void {
  tabs = tabs.filter((t) => t.path !== path);
  if (activePath === path) {
    activePath = tabs.length > 0 ? tabs[tabs.length - 1].path : null;
  }
  emit();
}

/** Focus an existing tab. */
export function setActive(path: string): void {
  if (tabs.some((t) => t.path === path)) {
    activePath = path;
    emit();
  }
}

/** Switch one tab between content and diff views. */
export function setMode(path: string, mode: 'content' | 'diff'): void {
  const tab = tabs.find((t) => t.path === path);
  if (tab !== undefined && tab.mode !== mode) {
    tab.mode = mode;
    emit();
  }
}

/** Subscribe to tab changes; returns the unsubscribe function. */
export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Current snapshot (same reference until the next mutation). */
export function getSnapshot(): FileViewSnapshot {
  return { tabs, activePath };
}

/** Drop all editor state (panel unmount). */
export function resetAll(): void {
  tabs = [];
  activePath = null;
  emit();
}
