/**
 * Client-side Remote contribution for the `fileTree` namespace.
 *
 * These descriptors mirror the `@Remote()` endpoints declared on the host
 * `FileTreeGateway` (src/index.ts). The client mounts them via
 * `ctx.remote.$mount(TYPERT_REMOTE)`, after which the namespace service
 * `remote.fileTree` exists. The typed face unwraps the RemoteResult envelope
 * into value-or-throw.
 */
import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';

/** Passthrough schema: accepts any JSON value unchanged. */
const passthrough = { parse: (value: unknown) => value };

/** One ordered business parameter (JSON-sourced, passthrough codec). */
const jsonParam = (name: string) => ({
  name,
  wire: name,
  source: 'json' as const,
  codec: { mode: 'strict' as const, typeSymbol: 'json', schema: passthrough },
});

/** Result codec (passthrough). */
const jsonResult = { mode: 'strict' as const, typeSymbol: 'json', schema: passthrough };

/** Build one direct-invocation descriptor. */
const direct = (method: string, parameters: string[]) => ({
  id: `dsh-file-tree#fileTree/${method}`,
  service: 'fileTree',
  namespace: 'fileTree',
  method,
  invocation: { kind: 'direct' as const },
  parameters: parameters.map(jsonParam),
  result: jsonResult,
});

/**
 * The remote contribution package `dsh-file-tree` mounts in the browser.
 * Mounting registers the namespace service; the UI plugin resolves
 * `remote.fileTree` and calls the endpoints directly.
 *
 * Descriptors mirror the host gateway's FLAT parameter names (the Typert SRC
 * contract derives wire fields from method signatures).
 */
export const TYPERT_REMOTE: TypertRemoteContribution = {
  package: 'dsh-file-tree',
  descriptors: [
    direct('listDir', ['path']),
    direct('readText', ['path']),
    direct('getRoot', []),
    direct('setRoot', ['path']),
    direct('getStatus', []),
    direct('getFileDiff', ['path']),
  ],
};

// ── business types shared with the host ────────────────────────────────────

export interface FileEntry {
  name: string;
  type: 'file' | 'directory' | 'other';
  size?: number;
  mtimeMs?: number;
}

export interface ListDirValue {
  path: string;
  entries: FileEntry[];
}

export interface ReadTextValue {
  path: string;
  content: string;
  mtimeMs: number;
  size: number;
}

export interface StatusEntry {
  path: string;
  index: string;
  worktree: string;
}

export interface StatusValue {
  isRepo: boolean;
  branch?: string;
  entries: StatusEntry[];
}

export interface DiffLine {
  type: 'add' | 'del' | 'ctx';
  text: string;
}

export interface DiffValue {
  path: string;
  lines: DiffLine[];
  binary: boolean;
  untracked: boolean;
}

// ── typed remote face ──────────────────────────────────────────────────────

/** The runtime-mounted namespace service face (RemoteResult envelope). */
export interface FileTreeRemote {
  listDir(path: string): Promise<RemoteResult<ListDirValue>>;
  readText(path: string): Promise<RemoteResult<ReadTextValue>>;
  getRoot(): Promise<RemoteResult<{ path: string }>>;
  setRoot(path: string): Promise<RemoteResult<{ path: string }>>;
  getStatus(): Promise<RemoteResult<StatusValue>>;
  getFileDiff(path: string): Promise<RemoteResult<DiffValue>>;
}

/** Unwrap a RemoteResult: return `value`, throw a readable Error on failure. */
export function unwrap<T>(result: RemoteResult<T>): T {
  if (result.ok) return result.value;
  const { code, message } = result.error;
  const err = new Error(`${message}${code ? ` (${code})` : ''}`);
  (err as { code?: string }).code = code;
  throw err;
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespaceMap {
    fileTree: FileTreeRemote;
  }
}
