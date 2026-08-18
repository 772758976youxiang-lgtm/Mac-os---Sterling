# Agent Note：移除首次使用的内测声明

状态：已实施

[English](2026-08-19-remove-first-run-internal-testing-notice.md) | 中文

## 问题

欢迎步骤是一则带版本的、阻塞式的内测声明：`ui-settings-models` 的浏览器端会在 `settings.onboarding` 账本中把它渲染为第一个步骤，直到用户确认当前文案版本。确认通过一个专用的 settings namespace（`ui-onboarding.welcomeNoticeVersion`）持久化，于是牵出了一整片支撑面——`ui-settings-general` 里的宿主端 settings 注册、`apiproxy` 的 settings allowlist 条目、远程浏览器的进程内回退、fixture 与 scaffold 的确认接线，以及专门的 e2e lane 与 golden。这则声明所宣告的内测姿态，GUI 早已越过；而上述全部机制的存在，只是为了给一个弹窗把关。

## 决策

内测声明被端到端移除。`WELCOME_NOTICE_COPY`、`WELCOME_NOTICE_VERSION` 门控与 `onboarding-copy.ts` 中的常量全部删除，连同 `WelcomeNotice` 组件、它的 store、样式、locale 键与 `settings.onboarding` 注册——首次运行现在直接落在余下的、按条件显示的 DeepSeek 凭据步骤上。随之失去所有者的 `ui-onboarding` settings namespace 一并移除：`ui-settings-general` 宿主端回到标准的空 node-half `apply`，`ui-onboarding` 退出 `apiproxy` 的产品 settings allowlist，connection fixture 中 `settings.mutate` 的欢迎确认特判简化为与 `update`/`replace` 相同的只读拒绝。web e2e lane 删除了欢迎步骤及其 `welcome.expected.md` golden，`remote-welcome.e2e.ts` 被删除，scaffold 中镜像的常量与预确认步骤不复存在，生成的 slot catalog 也不再列出 `welcome-notice` 占用项。用户 `settings.yaml` 中已残留的 `welcomeNoticeVersion` 会被直接忽略：该 namespace 不再注册，因此没有任何 schema 拒绝它，该值无害地留在文件中。

## 备选方案

**保留声明，仅修改文案。** 已否决：改文案只会把 `WELCOME_NOTICE_VERSION` 加一，让所有用户再看一次弹窗，而版本化确认机制——namespace、allowlist 条目、远程回退——为同一个弹窗维持全部维护成本。

**为将来的声明保留确认 namespace。** 已否决：仓库约定要求有当前所有者与需求；该 namespace、allowlist 条目、fixture 处理与文档在没有任何已注册消费方时全是死重。若将来要重新引入声明，应连同其消费方一起恢复该 namespace。

## 后果

首次运行直接进入 DeepSeek 凭据步骤（当已有可触达提供方时则直接进入普通界面），启动时没有弹窗阻塞，也没有确认写入。`ui-onboarding` 退出 settings allowlist，浏览器端不再暴露它；既有设置文档中的残留值处于惰性状态。缺席性已验证：没有任何源码、测试、文档或快照引用欢迎声明、`ui-onboarding` 或确认字段；`ui-settings-models`、`ui-settings-general`、connection-fixture 与 apiproxy 各套件通过，仓库类型检查为绿。
