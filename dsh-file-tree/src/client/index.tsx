/**
 * Client half of the dsh-file-tree plugin.
 *
 * Responsibilities:
 *  1. Mount the `fileTree` Typert Remote contribution so
 *     `ctx.remote.fileTree.*` becomes callable.
 *  2. Register the right-side file tree panel into the `details` slot at
 *     priority -1 (the single-seat slot is occupied by ui-conversation's
 *     tool-details panel at default priority 0, so our entry wins while it
 *     lives; closing the panel disposes the entry and tool details return).
 *  3. Register the chat-area file VIEWER as a `shell.overlay` entry: a
 *     floating card over the conversation column (chat stays visible).
 *  4. Register a session-header action button that opens / closes the panel.
 *  5. Open the details column by default, so the three columns (sidebar /
 *     chat / file tree) are visible together on load.
 *
 * All UI registration happens AFTER the remote contribution is mounted, so
 * the injected `remote.fileTree` face is always present. Services are read at
 * call time via ctx.get, never cached from apply scope.
 *
 * The client bundle is built to the ModuleLoader handoff format
 * (`window.__ModuleLoader__.load({ id, factory })`) by build.mjs; this module
 * is the bundle's entry, exporting the cordis plugin surface.
 */
import type { Context } from '@deepseek-ai/cordis';
import { TYPERT_REMOTE, type FileTreeRemote } from './remote.ts';
import { FileTreePanel } from './FileTreePanel.tsx';
import { FileViewerOverlay } from './FileViewerOverlay.tsx';
import styles from './styles.css';

// Inject the plugin stylesheet once (the bundle's css is text via esbuild).
const CSS_TAG = 'dsh-file-tree/styles.css';
if (typeof document !== 'undefined' && document.querySelector(`style[data-plugin-css="${CSS_TAG}"]`) === null) {
  const tag = document.createElement('style');
  tag.dataset.plugin = 'dsh-file-tree';
  tag.dataset.pluginCss = CSS_TAG;
  tag.textContent = styles;
  document.head.appendChild(tag);
}

/** Dictionary namespace owned by this plugin. */
const NS = 'dshFileTree';

const zh = {
  'panel.title': '文件',
  'panel.close': '收起面板',
  'panel.refresh': '刷新',
  'panel.onlyChanged': '仅显示改动',
  'panel.loading': '加载中…',
  'panel.empty': '空目录',
  'panel.count': '共',
  'panel.changed': '改动',
  'changed.tip': '本次会话改动',
  'toggle.open': '打开文件树',
  'toggle.close': '收起文件树',
  'view.tabs': '打开的文件',
  'view.close': '关闭',
  'view.empty': '在右侧文件树中选择一个文件，即可在此查看内容与改动',
  'view.content': '内容',
  'view.diff': '改动',
  'view.loading': '加载改动…',
  'view.binary': '二进制文件，无法显示改动',
  'view.noDiff': '该文件没有未提交的改动',
};

const en: Record<keyof typeof zh, string> = {
  'panel.title': 'Files',
  'panel.close': 'Close panel',
  'panel.refresh': 'Refresh',
  'panel.onlyChanged': 'Changed only',
  'panel.loading': 'Loading…',
  'panel.empty': 'Empty directory',
  'panel.count': 'Items',
  'panel.changed': 'Changed',
  'changed.tip': 'Changed this session',
  'toggle.open': 'Open file tree',
  'toggle.close': 'Close file tree',
  'view.tabs': 'Open files',
  'view.close': 'Close',
  'view.empty': 'Select a file in the right-side tree to view its content and changes',
  'view.content': 'Content',
  'view.diff': 'Changes',
  'view.loading': 'Loading changes…',
  'view.binary': 'Binary file, no diff available',
  'view.noDiff': 'No uncommitted changes for this file',
};

/** Required client services. */
export const inject = ['slots', 'locale', 'remote'];

/** The layout face, read at call time so a stale apply-scope value never leaks. */
function layoutOf(ctx: Context): { openDetails(): void; closeDetails(): void } | undefined {
  return ctx.get('layout') as { openDetails(): void; closeDetails(): void } | undefined;
}

/**
 * Client plugin body: mount the remote first, then register all UI and open
 * the details column by default.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-file-tree: dictionaries');
  const t = ctx.locale.bind(NS);

  ctx.effect(async () => {
    const disposeRemote = await ctx.remote.$mount(TYPERT_REMOTE);
    const remote = ctx.get('remote.fileTree') as FileTreeRemote;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const disposers: Array<() => void> = [];

    let open = false;
    const setOpen = (value: boolean) => { open = value; };
    const toggleDetails = () => {
      const layout = layoutOf(ctx);
      if (layout === undefined) return;
      if (open) { layout.closeDetails(); setOpen(false); }
      else { layout.openDetails(); setOpen(true); }
    };

    // ── right-side file tree panel (details column) ────────────────────────
    disposers.push(ctx.slots.inject('details', () => ctx.slots.register({
      name: 'details',
      priority: -1,
      locale: NS,
      registrant: 'dsh-file-tree',
      inject: () => ({
        closeDetails: () => {
          layoutOf(ctx)?.closeDetails();
          setOpen(false);
        },
        remote,
      }),
    }, FileTreePanel)));

    // ── chat-area viewer overlay (shell.overlay) ───────────────────────────
    disposers.push(ctx.slots.inject('shell.overlay', () => ctx.slots.register({
      name: 'shell.overlay',
      id: 'dsh-file-tree-viewer',
      locale: NS,
      registrant: 'dsh-file-tree',
    }, () => <FileViewerOverlay remote={remote} t={t} />)));

    // ── session-header toggle button ───────────────────────────────────────
    disposers.push(ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
      name: 'conversation.session.header.actions',
      id: 'dsh-file-tree-toggle',
      order: 30,
      locale: NS,
      registrant: 'dsh-file-tree',
      inject: () => ({ onToggle: toggleDetails, isOpen: () => open }),
    }, FileToggleButton)));

    // ── open the right-side file tree by default (three-column layout) ─────
    // The layout store is wired once the root entry renders; retry a few
    // times in case this fiber activates before that.
    const tryOpen = (attempt: number) => {
      const layout = layoutOf(ctx);
      if (layout !== undefined) {
        try {
          layout.openDetails();
          setOpen(true);
          return;
        } catch {
          // Layout store not wired yet — fall through to the retry.
        }
      }
      if (attempt < 5) {
        timers.push(setTimeout(() => tryOpen(attempt + 1), 500));
      }
    };
    timers.push(setTimeout(() => tryOpen(0), 300));

    return () => {
      for (const timer of timers) clearTimeout(timer);
      for (const dispose of disposers) dispose();
      void disposeRemote();
    };
  }, 'dsh-file-tree: mount remote + register UI + open by default');
}

/** The header action button: opens / closes the right-side file tree panel. */
function FileToggleButton(props: {
  t?: (key: string) => string;
  onToggle: () => void;
  isOpen: () => boolean;
}): JSX.Element {
  const { t: translate, onToggle, isOpen } = props;
  const title = translate ? (isOpen() ? translate('toggle.close') : translate('toggle.open')) : undefined;
  return (
    <button
      type="button"
      className="dshft-toggle"
      title={title}
      aria-label={translate ? translate('panel.title') : '文件'}
      onClick={onToggle}
      style={isOpen() ? { color: 'var(--dsw-static-deepseek-400, #679efe)' } : undefined}
    >
      <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden style={{ display: 'block' }}>
        <path
          d="M1.5625 2.84375C1.5625 2.12975 2.12975 1.5625 2.84375 1.5625H6.06641C6.47763 1.56251 6.87007 1.72608 7.1582 2.01587L7.70923 2.5697C7.94552 2.80715 8.26392 2.9375 8.59521 2.9375H13.1562C13.8703 2.9375 14.4375 3.50475 14.4375 4.21875V6.21875C13.7519 6.21875 13.1762 6.62428 12.9489 7.18257C12.2939 6.76029 11.4732 6.53125 10.5938 6.53125C7.84717 6.53125 5.625 8.75342 5.625 11.5C5.625 12.0615 5.71153 12.6031 5.87097 13.1122C5.45918 13.1399 5.03562 13.1168 4.62476 13.0202L4.49634 12.9906C2.7437 12.5933 1.5625 11.0188 1.5625 9.22607V2.84375Z"
          fill="currentColor"
        />
        <path
          d="M10.5938 7.78125C12.6477 7.78125 14.3125 9.44604 14.3125 11.5C14.3125 13.554 12.6477 15.2188 10.5938 15.2188C8.53979 15.2188 6.875 13.554 6.875 11.5C6.875 9.44604 8.53979 7.78125 10.5938 7.78125Z"
          fill="currentColor"
          opacity="0.45"
        />
        <path
          d="M9.96875 10.0312V10.875H9.125C8.85085 10.875 8.625 11.1009 8.625 11.375V11.625C8.625 11.8991 8.85085 12.125 9.125 12.125H9.96875V12.9688C9.96875 13.2429 10.1946 13.4688 10.4688 13.4688H10.7188C10.9929 13.4688 11.2188 13.2429 11.2188 12.9688V12.125H12.0625C12.3366 12.125 12.5625 11.8991 12.5625 11.625V11.375C12.5625 11.1009 12.3366 10.875 12.0625 10.875H11.2188V10.0312C11.2188 9.7571 10.9929 9.53125 10.7188 9.53125H10.4688C10.1946 9.53125 9.96875 9.7571 9.96875 10.0312Z"
          fill="currentColor"
        />
      </svg>
    </button>
  );
}
