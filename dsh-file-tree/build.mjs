/**
 * Build script for the dsh-file-tree plugin.
 *
 *  - Host half: compile src/index.ts → dist/index.js with `tsc`.
 *    MUST be tsc (not esbuild): the `@Remote()` decorators from
 *    @deepseek-ai/dsh-typert-protocol are stage-3 decorators, and esbuild
 *    lowers them to the legacy form whose context shape the runtime rejects.
 *    Imports of @deepseek-ai/* stay external and resolve from the profile's
 *    node_modules at runtime.
 *  - Client half: bundle src/client/index.tsx → dist/client.js in the
 *    ModuleLoader handoff format:
 *
 *        window.__ModuleLoader__.load({ id: "dsh-file-tree", factory: (require) => {...} })
 *
 *    Platform seed words (react, @deepseek-ai/cordis, …) stay external so the
 *    browser module table resolves them; CSS is inlined as text and injected
 *    by the bundle itself. The client half uses no decorators, so esbuild is
 *    fine here.
 *
 * Usage:  node build.mjs [--watch]
 */
import { context } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');

// ModuleLoader platform seed words + graph rows the browser half can require.
const CLIENT_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-runtime/client',
  '@deepseek-ai/dsh-client-connection/client',
  '@deepseek-ai/dsh-api-gateway/client',
];

const CLIENT_BANNER = `
window.__ModuleLoader__.load({
  id: "dsh-file-tree",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
`.trimStart();

const CLIENT_FOOTER = `
    return module.exports;
  }
});
`.trimStart();

mkdirSync('dist', { recursive: true });

// ── host half: tsc ─────────────────────────────────────────────────────────
function compileHost() {
  const tsconfig = join(here, 'tsconfig.host.json');
  execFileSync(process.execPath, [
    join(here, 'node_modules', 'typescript', 'bin', 'tsc'),
    '-p', tsconfig,
    '--pretty', 'false',
  ], { stdio: 'inherit' });
  console.log('[dsh-file-tree] host compiled → dist/index.js');
}

// ── client half: esbuild ───────────────────────────────────────────────────
async function buildClient() {
  const options = {
    entryPoints: [join(here, 'src/client/index.tsx')],
    outfile: join(here, 'dist/client.js'),
    bundle: true,
    // The ModuleLoader factory returns `module.exports`; CommonJS output is
    // what makes esbuild assign the entry's named `apply` and `inject`
    // exports to that object. IIFE output silently drops the entry exports.
    format: 'cjs',
    platform: 'browser',
    target: ['es2020'],
    jsx: 'automatic',
    external: CLIENT_EXTERNALS,
    banner: { js: CLIENT_BANNER },
    footer: { js: CLIENT_FOOTER },
    loader: { '.css': 'text' },
    logLevel: 'info',
  };
  if (watch) {
    const c = await context(options);
    await c.watch();
    console.log('[dsh-file-tree] watching client → dist/client.js');
  } else {
    const result = await (await import('esbuild')).build(options);
    console.log('[dsh-file-tree] client bundled → dist/client.js');
    return result;
  }
}

compileHost();
await buildClient();
