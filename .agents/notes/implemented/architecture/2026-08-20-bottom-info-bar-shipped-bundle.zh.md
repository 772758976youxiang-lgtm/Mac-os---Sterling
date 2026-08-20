# Agent Note: 底部信息栏作为默认 web bundle 随安装提供

Status: implemented

[English](2026-08-20-bottom-info-bar-shipped-bundle.md) | 中文

## 问题

vendored 的 `dsh-bottom-info-bar` 插件（实时余额 / 订阅额度信息栏）此前通过
`dsh plugin add` 安装到用户的 `web` profile：在 `~/.dsh/profiles/web/package.json` 里
写入一条 `link:` 依赖和一个 `bundles` 条目。运行时一次 profile 重建丢掉了该条目：
插件不再挂载、余额行消失，而自动安装脚本（`scripts/install-bottom-info-bar.mjs`
postinstall、lefthook `post-merge` / `post-checkout` 钩子）没能恢复它，因为 profile
重建不会执行 `pnpm install`。通过改写单个用户的 profile 来提供内置能力是脆弱的；
能力应当来自安装本身。

## 决策

底部信息栏现在属于安装闭包和交付的 `web` profile 模板，因此任何 `web` profile——
新建或重建——默认都会挂载它：

- `pnpm-workspace.yaml` 增加 `dsh-bottom-info-bar/plugin` 作为 workspace 成员（包根
  是 `plugin/` 目录；顶层目录是 vendored 仓库）。
- `apps/cli/package.json` 依赖 `dsh-bottom-info-bar: workspace:*`。CLI manifest 就是
  安装锚点（`INSTALL_ANCHOR`），因此它的依赖闭包恰好是
  `healProfilesModuleFallback` 链接进 `$DSH_HOME/profiles/node_modules` 的范围——
  即 `packages/boot/app-boot` 中"bundles come from the installation"契约。
- `packages/boot/app-boot/src/profile.ts` 中 `PROFILE_TEMPLATES.web` 变为
  `['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'dsh-bottom-info-bar']`，
  新建或重建的 `web` profile 初始化时即挂载该插件。
- `dsh-bottom-info-bar/plugin/package.json` 增加 `prepare` 脚本执行
  `scripts/build.mjs`，使 workspace 安装总是重新生成被 gitignore 的 `plugin/lib/`
  产物（`lib/index.js`、`lib/client.js`）。

插件行仍通过 `resolveBundleDir` 解析（先安装锚点、后 profile 目录），manifest 仍需
声明 `dsh.bundle.patch`，client 半区仍由 client-modules 扫描下发——加载器无需任何改动。

## 备选方案

- **仅保留 postinstall / lefthook 自动安装**——否决：profile 重建既不跑 `pnpm install`
  也不跑 git 钩子，这正是本 note 修复的故障。旧机制（根 `postinstall` 中的
  `scripts/install-bottom-info-bar.mjs`、`post-merge` / `post-checkout` lefthook 任务、
  `scripts/auto-install-bottom-info-bar.sh`）随本次改动一并移除：交付模板已覆盖首次
  使用，它对任何环境（全新或重建）都是死代码。
- **把插件源码迁入 `packages/*/*` 并改为 TypeScript 包**——否决：对 vendored 纯 JS
  插件而言不成比例。它留在原位置的 workspace 成员，并与其他 bundle 包走同一解析路径。
- **只加入 `INSTALLATION_OWNED_PROFILE_TUPLES`**——否决：该机制是 `headless` 模板的
  迁移垫片，且没有 `web` 条目；修改模板列表才是交付默认值，正是我们想要的。

## 影响

- 本次改动后新建的任何 `web` profile 无需任何安装步骤即挂载底部信息栏。用户现有
  profile 保留手动添加的行（模板改动从不改写已初始化 profile 的 manifest，除非它等于
  `INSTALLATION_OWNED_PROFILE_TUPLES` 条目；`web` 没有该条目）。
- 全新 clone 只需 `pnpm install`（通过 `prepare` 构建 `plugin/lib/`）然后 `dsh web`。
  旧的 postinstall / lefthook 自动安装脚本在同一改动中移除；它们对全新环境是幂等
  空操作，而且无论如何都无法恢复被重建的 profile。
- `dsh` CLI 现在依赖该插件包；插件的唯一 peer 依赖（`react`）必须保持可在 workspace
  闭包中解析。

## 测试

使用一次性的 `DSH_HOME` 验证：

- `PROFILE_TEMPLATES.web` 解析成功，`loadProfile` 挂载全部三个 bundle，其中
  `dsh-bottom-info-bar` 通过 `apps/cli/node_modules`（workspace 链接）解析，patch 单行。
- `pnpm install` 成功；workspace `prepare` 构建出 `plugin/lib/`，postinstall 自动安装
  报告"已注册到 web profile，跳过"（幂等跳过）。
- 运行中的实例可正常下发 `/plugins/dsh-bottom-info-bar/client.js`（HTTP 200），且
  `window.__DSH_BOOT__` 中列出该插件。
