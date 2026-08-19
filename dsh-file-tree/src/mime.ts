/** Binary-name heuristic shared by the gateway's text guards. */

const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'avif', 'heic',
  'pdf', 'zip', 'tar', 'gz', 'bz2', 'xz', '7z', 'rar', 'wasm',
  'mp3', 'mp4', 'mov', 'mkv', 'webm', 'wav', 'flac', 'ogg',
  'woff', 'woff2', 'ttf', 'otf', 'eot', 'exe', 'dll', 'so', 'dylib', 'bin',
]);

/** Whether a file name should be treated as text (heuristic). */
export function isTextName(name: string): boolean {
  const dot = name.lastIndexOf('.');
  if (dot === -1) return true;
  return !BINARY_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}
