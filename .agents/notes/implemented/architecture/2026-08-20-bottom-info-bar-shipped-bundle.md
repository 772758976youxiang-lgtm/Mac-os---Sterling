# Agent Note: Bottom info bar ships as a default web bundle

Status: implemented

English | [中文](2026-08-20-bottom-info-bar-shipped-bundle.zh.md)

## Problem

The vendored `dsh-bottom-info-bar` plugin (live balance / subscription info row) was
installed into the user's `web` profile through `dsh plugin add`, which records a
`link:` dependency and a `bundles` entry in `~/.dsh/profiles/web/package.json`.
A profile rebuild at runtime dropped that entry: the plugin stopped mounting, the
balance row disappeared, and the auto-install scripts (`scripts/install-bottom-info-bar.mjs`
postinstall, lefthook `post-merge`/`post-checkout` hooks) did not recover it because a
profile rebuild does not run `pnpm install`. Installing a shipped capability by mutating
one user's profile is fragile; the capability should come from the installation itself.

## Decision

The bottom info bar is now part of the installation closure and of the shipped `web`
profile template, so every `web` profile — fresh or rebuilt — mounts it by default:

- `pnpm-workspace.yaml` adds `dsh-bottom-info-bar/plugin` as a workspace member (the
  package root is the `plugin/` directory; the top-level directory is the vendored repo).
- `apps/cli/package.json` depends on `dsh-bottom-info-bar: workspace:*`. The CLI manifest
  is the installation anchor (`INSTALL_ANCHOR`), so its dependency closure is exactly
  what `healProfilesModuleFallback` links into `$DSH_HOME/profiles/node_modules` — the
  "bundles come from the installation" contract in `packages/boot/app-boot`.
- `PROFILE_TEMPLATES.web` in `packages/boot/app-boot/src/profile.ts` becomes
  `['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'dsh-bottom-info-bar']`, so a
  new or rebuilt `web` profile initializes with the plugin mounted.
- `dsh-bottom-info-bar/plugin/package.json` gains a `prepare` script that runs
  `scripts/build.mjs`, so the workspace install always regenerates the gitignored
  `plugin/lib/` artifacts (`lib/index.js`, `lib/client.js`).

The plugin row still resolves through `resolveBundleDir` (installation anchor first,
then the profile), still requires `dsh.bundle.patch` in its manifest, and its client half
is still served by the client-modules scan — no loader change was needed.

## Alternatives considered

- **Keep the postinstall/lefthook auto-install as the only mechanism** — rejected
  because a profile rebuild does not run `pnpm install` or git hooks, which is exactly
  the failure this note fixes. The old mechanism (`scripts/install-bottom-info-bar.mjs`
  in the root `postinstall`, the `post-merge`/`post-checkout` lefthook jobs, and
  `scripts/auto-install-bottom-info-bar.sh`) was removed with this change: the shipped
  template covers first use, so it was dead weight for every setup, fresh or rebuilt.
- **Move the plugin source into `packages/*/*` as a TypeScript package** — rejected as
  disproportionate for a vendored, plain-JS plugin. It stays a workspace member at its
  vendored location and is consumed through the same bundle resolution as any other
  bundle package.
- **Add the bundle only to `INSTALLATION_OWNED_PROFILE_TUPLES`** — rejected: that
  mechanism is a migration shim for the `headless` template and has no `web` entry;
  editing the template list is the shipped default, which is what we want.

## Consequences

- Any `web` profile created after this change mounts the bottom info bar without any
  install step. The user's existing profile keeps its manually added row (template edits
  never rewrite an initialized profile's manifest unless it equals an
  `INSTALLATION_OWNED_PROFILE_TUPLES` entry, and `web` has none).
- A fresh clone needs only `pnpm install` (which builds `plugin/lib/` via `prepare`)
  followed by `dsh web`. The old postinstall/lefthook auto-install scripts were removed
  in the same change; they were idempotent no-ops for fresh setups and could not recover
  a rebuilt profile anyway.
- `dsh` CLI now depends on the plugin package; the plugin's only peer dependency
  (`react`) must stay resolvable in the workspace closure.

## Testing

Verified with a throwaway `DSH_HOME`:

- `PROFILE_TEMPLATES.web` resolves and `loadProfile` mounts all three bundles, resolving
  `dsh-bottom-info-bar` through `apps/cli/node_modules` (workspace link) with its single
  patch row.
- `pnpm install` succeeds; the workspace `prepare` builds `plugin/lib/`, and the
  postinstall auto-install reports "已注册到 web profile，跳过" (idempotent skip).
- The running instance serves `/plugins/dsh-bottom-info-bar/client.js` (HTTP 200) and
  lists the plugin in `window.__DSH_BOOT__`.
