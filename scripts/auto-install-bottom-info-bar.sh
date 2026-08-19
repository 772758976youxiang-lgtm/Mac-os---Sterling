#!/usr/bin/env bash
# git hook 入口：拉取/切换分支后自动同步安装 dsh-bottom-info-bar 插件（幂等）。
# 由 lefthook 的 post-merge / post-checkout 钩子调用；本机无 node 时静默跳过，
# 任何失败都不阻断 git 操作本身。
set -u

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "$(cd "$(dirname "$0")/.." && pwd)")"
[ -f "$ROOT/scripts/install-bottom-info-bar.mjs" ] || exit 0

NODE_BIN="$(command -v node 2>/dev/null || true)"
if [ -z "$NODE_BIN" ]; then
  for p in /opt/homebrew/bin/node /usr/local/bin/node "$HOME/.cache/codex-runtimes"/*/dependencies/node/bin/node; do
    if [ -x "$p" ]; then NODE_BIN="$p"; break; fi
  done
fi

if [ -z "$NODE_BIN" ]; then
  echo "[dsh-bottom-info-bar:auto] 未找到 node，跳过自动安装（安装 node 与 pnpm 后运行 pnpm install 即可）"
  exit 0
fi

"$NODE_BIN" "$ROOT/scripts/install-bottom-info-bar.mjs" || true
