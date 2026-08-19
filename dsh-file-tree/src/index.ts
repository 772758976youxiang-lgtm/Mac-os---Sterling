/**
 * Host half of the dsh-file-tree plugin.
 *
 * Exposes a Typert Remote service (`fileTree`) that the browser client half
 * calls to browse the current conversation's workspace, list the files this
 * session changed (git status), and read file contents / diffs.
 *
 * IMPORTANT (SRC descriptor contract): the Typert gateway derives wire
 * parameter names from the method signature via Function.prototype.toString —
 * each method's parameter NAME is the wire field the client must send.
 * Methods therefore take FLAT parameters (e.g. `listDir(path: string)`, not
 * `listDir(input: {...})`), and the client's descriptors must mirror those
 * names exactly.
 *
 * All paths resolve against the workspace root pinned by configuration (and
 * re-pinned by the browser via setRoot to the current session's cwd) and are
 * rejected when they escape it.
 */
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { Context } from '@deepseek-ai/cordis';
import * as fs from 'node:fs/promises';
import * as nodePath from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { isTextName } from './mime.js';

const execFileAsync = promisify(execFile);

/** One directory entry in a listing. */
export interface FileEntry {
  name: string;
  type: 'file' | 'directory' | 'other';
  size?: number;
  mtimeMs?: number;
}

/** Result of listing one directory level. */
export interface ListDirResult {
  path: string;
  entries: FileEntry[];
}

/** Result of a text read. */
export interface ReadTextResult {
  path: string;
  content: string;
  mtimeMs: number;
  size: number;
}

/** One git status entry (porcelain v1 row). */
export interface StatusEntry {
  /** Repository-relative path (quotes unescaped). */
  path: string;
  /** Index column status code (' ' when unchanged). */
  index: string;
  /** Worktree column status code (' ' when unchanged). */
  worktree: string;
}

/** git status result for the pinned root. */
export interface StatusResult {
  isRepo: boolean;
  branch?: string;
  entries: StatusEntry[];
}

/** One diff line for the viewer (no leading +/- marker in text). */
export interface DiffLine {
  type: 'add' | 'del' | 'ctx';
  text: string;
}

/** Diff of one file. */
export interface DiffResult {
  path: string;
  lines: DiffLine[];
  /** True when the file is binary (or too large): no lines rendered. */
  binary: boolean;
  /** True when the file is untracked (rendered as all-additions). */
  untracked: boolean;
}

/**
 * Resolve an untrusted client path against the workspace root.
 *
 * Accepts either a root-relative path ("/", "src/a.ts") or an absolute path
 * that stays inside the root. The parent directory is realpath-verified to
 * block symlink escapes, and the final resolved path must stay inside the
 * root. ".." segments that would escape are rejected.
 */
export async function resolveInside(root: string, requested: string): Promise<string> {
  const rootReal = await fs.realpath(root);
  const normalized = requested.replace(/\\/g, '/');
  const abs = normalized === '/' || normalized === ''
    ? rootReal
    : nodePath.isAbsolute(normalized)
    ? nodePath.normalize(normalized)
    : nodePath.resolve(rootReal, normalized.replace(/^\/+/, ''));
  const parent = nodePath.dirname(abs);
  const parentReal = await fs.realpath(parent);
  const resolved = nodePath.join(parentReal, nodePath.basename(abs));
  const rel = nodePath.relative(rootReal, resolved);
  if (rel.startsWith('..') || nodePath.isAbsolute(rel)) {
    throw new Error(`path escapes the workspace root: ${requested}`);
  }
  return resolved;
}

/** Unescape one git-quoted path ("a b.txt" style). */
export function unquoteGitPath(raw: string): string {
  if (!raw.startsWith('"')) return raw;
  let out = '';
  for (let i = 1; i < raw.length - 1; i++) {
    const ch = raw[i];
    if (ch === '\\' && i + 1 < raw.length - 1) {
      const next = raw[i + 1];
      if (next === 't') { out += '\t'; i++; continue; }
      if (next === 'n') { out += '\n'; i++; continue; }
      out += next; i++; continue;
    }
    out += ch;
  }
  return out;
}

/** Run git against the pinned root; resolves null when the root is not a repository. */
async function git(root: string, args: string[]): Promise<{ stdout: string; stderr: string } | null> {
  try {
    return await execFileAsync('git', ['-C', root, ...args], {
      maxBuffer: 64 * 1024 * 1024,
      encoding: 'utf8',
    });
  } catch {
    return null;
  }
}

/**
 * The file tree gateway: filesystem + git RPC endpoints consumed by the
 * browser client half. Every `@Remote` method takes flat parameters whose
 * names are the wire fields the client sends (SRC descriptor contract).
 */
export class FileTreeGateway extends TypertRemoteService {
  static inject: string[] = [];

  /** Workspace root served by the gateway; re-pinnable via setRoot. */
  private root: string;

  constructor(ctx: Context, config: { root?: string } = {}) {
    super(ctx, 'fileTree');
    this.root = nodePath.resolve(config.root ?? process.cwd());
  }

  /**
   * List one directory level.
   * @param path - target directory path (absolute inside root, or relative to root).
   */
  @Remote('listDir')
  async listDir(path: string): Promise<ListDirResult> {
    const target = await resolveInside(this.root, path);
    const dirents = await fs.readdir(target, { withFileTypes: true });
    const entries: FileEntry[] = [];
    for (const dirent of dirents) {
      if (dirent.name.startsWith('.git')) continue;
      const entry: FileEntry = {
        name: dirent.name,
        type: dirent.isDirectory() ? 'directory' : dirent.isFile() ? 'file' : 'other',
      };
      if (entry.type === 'file') {
        try {
          const st = await fs.stat(nodePath.join(target, dirent.name));
          entry.size = st.size;
          entry.mtimeMs = st.mtimeMs;
        } catch {
          // Unreadable metadata: keep the entry without it.
        }
      }
      entries.push(entry);
    }
    entries.sort((a, b) => {
      if (a.type === 'directory' && b.type !== 'directory') return -1;
      if (a.type !== 'directory' && b.type === 'directory') return 1;
      return a.name.localeCompare(b.name);
    });
    return { path: target, entries };
  }

  /**
   * Read a text file (UTF-8). Binary files are rejected with a clear error.
   * @param path - target file path.
   */
  @Remote('readText')
  async readText(path: string): Promise<ReadTextResult> {
    const target = await resolveInside(this.root, path);
    if (!isTextName(nodePath.basename(target))) {
      throw new Error(`refusing to read binary file: ${target}`);
    }
    const st = await fs.stat(target);
    if (!st.isFile()) throw new Error(`not a regular file: ${target}`);
    const MAX_BYTES = 5 * 1024 * 1024;
    if (st.size > MAX_BYTES) throw new Error(`file too large to open (${st.size} bytes > ${MAX_BYTES})`);
    const content = await fs.readFile(target, 'utf8');
    return { path: target, content, mtimeMs: st.mtimeMs, size: st.size };
  }

  /** Return the workspace root the gateway serves. */
  @Remote('getRoot')
  async getRoot(): Promise<{ path: string }> {
    return { path: this.root };
  }

  /**
   * Re-pin the workspace root the gateway serves. The browser calls this with
   * the current conversation's workspace directory when the panel opens.
   * @param path - absolute workspace directory, or a path relative to the current root.
   */
  @Remote('setRoot')
  async setRoot(path: string): Promise<{ path: string }> {
    const abs = nodePath.isAbsolute(path)
      ? nodePath.normalize(path)
      : nodePath.resolve(this.root, path);
    const st = await fs.stat(abs);
    if (!st.isDirectory()) throw new Error(`not a directory: ${abs}`);
    this.root = await fs.realpath(abs);
    return { path: this.root };
  }

  /**
   * git status of the pinned root (porcelain v1). Non-repository roots
   * resolve with `isRepo: false` and no entries.
   */
  @Remote('getStatus')
  async getStatus(): Promise<StatusResult> {
    const out = await git(this.root, ['status', '--porcelain', '--branch']);
    if (out === null) return { isRepo: false, entries: [] };
    const entries: StatusEntry[] = [];
    let branch: string | undefined;
    for (const raw of out.stdout.split('\n')) {
      if (raw === '') continue;
      if (raw.startsWith('## ')) {
        // "## main...origin/main [ahead 1]" — take the local branch name.
        const head = raw.slice(3).split('...')[0].trim();
        if (head !== '' && head !== 'HEAD (no branch)') branch = head;
        continue;
      }
      if (raw.length < 4) continue;
      const index = raw[0];
      const worktree = raw[1];
      let path = raw.slice(3);
      // Rename/copy rows carry "old -> new": surface the destination.
      const arrow = path.indexOf(' -> ');
      if (arrow !== -1) path = path.slice(arrow + 4);
      entries.push({ path: unquoteGitPath(path), index, worktree });
    }
    return { isRepo: true, branch, entries };
  }

  /**
   * Diff of one file against HEAD (staged + unstaged merged), rendered as
   * viewer lines. Untracked files render as all-additions; binary files or
   * files with no diff resolve with an empty line list.
   * @param path - target file path (absolute inside root, or relative to root).
   */
  @Remote('getFileDiff')
  async getFileDiff(path: string): Promise<DiffResult> {
    const target = await resolveInside(this.root, path);
    const rel = nodePath.relative(this.root, target).split(nodePath.sep).join('/');

    const status = await this.getStatus();
    const entry = status.entries.find((e) => e.path === rel);
    const untracked = entry !== undefined && entry.index === '?' && entry.worktree === '?';
    if (untracked) {
      const st = await fs.stat(target).catch(() => null);
      if (st === null || !st.isFile()) return { path: target, lines: [], binary: false, untracked: true };
      const MAX_BYTES = 5 * 1024 * 1024;
      if (st.size > MAX_BYTES) return { path: target, lines: [], binary: true, untracked: true };
      if (!isTextName(nodePath.basename(target))) return { path: target, lines: [], binary: true, untracked: true };
      const content = await fs.readFile(target, 'utf8');
      const lines = content.split('\n').filter((l, i, arr) => !(i === arr.length - 1 && l === ''))
        .map((text) => ({ type: 'add' as const, text }));
      return { path: target, lines, binary: false, untracked: true };
    }

    const staged = await git(this.root, ['diff', '--cached', '--', rel]);
    const unstaged = await git(this.root, ['diff', '--', rel]);
    const raw = `${staged?.stdout ?? ''}\n${unstaged?.stdout ?? ''}`;
    if (raw.includes('Binary files')) return { path: target, lines: [], binary: true, untracked: false };

    const lines: DiffLine[] = [];
    for (const rawLine of raw.split('\n')) {
      if (rawLine.startsWith('+++') || rawLine.startsWith('---') || rawLine.startsWith('diff --git')) continue;
      if (rawLine.startsWith('@@')) { lines.push({ type: 'ctx', text: rawLine }); continue; }
      if (rawLine.startsWith('+')) { lines.push({ type: 'add', text: rawLine.slice(1) }); continue; }
      if (rawLine.startsWith('-')) { lines.push({ type: 'del', text: rawLine.slice(1) }); continue; }
      lines.push({ type: 'ctx', text: rawLine });
    }
    return { path: target, lines, binary: false, untracked: false };
  }
}

export default FileTreeGateway;
