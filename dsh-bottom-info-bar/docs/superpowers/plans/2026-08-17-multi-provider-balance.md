# Multi-provider Balance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install the replacement bottom information bar with route-correct DeepSeek and Rayplus balances while retaining ChatGPT/Codex and OpenCode Go subscription quotas.

**Architecture:** Resolve the active route from `agentDefaultModel`, derive non-secret provider metadata from DSH settings, and dispatch balance requests through a small adapter registry. Keep subscription sources separate and preserve the existing slot-shadowing client.

**Tech Stack:** JavaScript ESM host plugin, static React client bundle, Node smoke/unit tests, DSH plugin CLI.

---

### Task 1: Balance adapter pure logic

**Files:**
- Modify: `tests/test-multi-provider-balance.js`
- Modify: `tests/run-all.mjs`
- Modify: `plugin/src/host.js`

- [ ] Write failing tests for DeepSeek, Rayplus, custom path parsing, endpoint normalization, and unsupported routes.
- [ ] Run `node tests/test-multi-provider-balance.js` and confirm the missing adapter functions cause the expected failure.
- [ ] Implement adapter declaration parsing, settings-based route discovery, and response parsers.
- [ ] Re-run the focused test and confirm all cases pass.

### Task 2: Route-specific snapshots

**Files:**
- Modify: `tests/test-multi-provider-balance.js`
- Modify: `plugin/src/host.js`
- Modify: `plugin/src/client-bundle.js`

- [ ] Add failing tests proving the active route selects its own credential and endpoint, failures retain only that route's snapshot, and unsupported routes do not fall back to DeepSeek.
- [ ] Run the focused test and confirm the assertions fail for the current global-provider implementation.
- [ ] Replace the fixed provider table with lazy route resolution and pass the active provider to `getBalanceSnapshot`.
- [ ] Re-run focused and client tests.

### Task 3: Subscription regressions and documentation

**Files:**
- Modify: `tests/test-dual-mode.js`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/INSTALL.md`
- Modify: `plugin/package.json`

- [ ] Add assertions that subscription routes bypass balance adapters and retain both subscription sources.
- [ ] Document automatic and custom balance adapters, unsupported behavior, and retained subscription quota behavior.
- [ ] Bump the plugin patch version for local installation.
- [ ] Run `node tests/run-all.mjs` and `node plugin/scripts/build.mjs`.

### Task 4: Install and live verification

**Files:**
- Installed profile: `C:/Users/PC/.dsh/profiles/web/`

- [ ] Run `pnpm dsh plugin --profile web add "D:/deepseek harness/dsh-bottom-info-bar/plugin"`.
- [ ] Restart the existing hidden `pnpm dsh web` process through the established launcher.
- [ ] Verify `pnpm dsh --profile web --dump-config` contains `dsh-bottom-info-bar`.
- [ ] Verify the local plugin RPC returns the selected provider's balance status without exposing credentials.
