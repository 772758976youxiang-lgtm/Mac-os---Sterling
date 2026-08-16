# Agent Note: SMTP daily digest for scheduled results

Status: implemented

[English](2026-08-16-email-digest-smtp.md) | 中文

## Problem

Session-local Schedule 能在 live 对话中唤醒任务并获得 assistant 结果，但无法通知未在查看对话的用户。邮件功能必须延续 Schedule 的持久化权威，不能把 SMTP 密码写入配置或 Session 日志，也不能在 SMTP 服务端接受邮件前宣称投递成功。

## Decision

`@deepseek-ai/dsh-email-digest` 是可选的 Cordis function plugin。它只观察插件加载后创建的根 Agent。当 Schedule 生成的 user 消息之后出现 assistant 消息时，插件向该 Agent 的 Session 追加版本化的 `email-digest/change` `collect` 事件。事件记录回复、来源提示、可选的 Schedule id、收集时间与 Session 标识。

在配置的 IANA 时区每日发送时刻，每个 live 根 Session 独立折叠自己的日志后缀，并通过 SMTP 发送尚未投递的收集项。SMTP 密码是 `passwordRef`，每次发送都通过 `ctx.credentials` 解析；配置和持久化日志都不会接收该密钥。QQ 与 163 使用服务商签发的 SMTP 客户端授权码即可支持。

SMTP 接受邮件后才会追加标明已发送项 id 的持久化 `deliver` 事件，随后进行正常 Session flush。这提供至少一次投递：SMTP 接受后、追加标记前如果进程崩溃，摘要可能再次发送。发送失败会保留待发项目，并在配置的延迟后重试。不会扫描或唤醒 cold Session，因此它们只会在根 Agent 恢复后参与。

## Alternatives considered

**使用邮箱 API 或浏览器登录。** 服务商专用 OAuth 刷新和浏览器会话会把过期、授权与服务商差异引入核心功能。使用 SMTP 与客户端授权码能覆盖常见服务商，并保持传输边界狭窄。

**将投递状态存入私有数据库。** 第二个存储需要与 Session 日志做身份对齐与崩溃恢复。仅追加的 Session 事件已经提供所需的持久化收集与投递账本。

**在 SMTP 之前标记项目为已投递。** 网络投递失败时会静默丢失日报。仅在 SMTP 接受后记录，以有界的重复替代丢失。

**全局扫描 cold Session。** 这需要持久化所有权、启动枚举、全局汇总，以及唤醒非活跃任务的策略。该功能有意保留 Schedule 的 live、Session-local 投递边界。

## Consequences

- 更新配置引用的凭据来源即可轮换 SMTP 凭据，下一次尝试会重新读取。
- 即使所有 live 根 Session 共用收件人列表，每个 Session 仍会独立生成摘要；跨 Session 汇总有意延后。
- 持久化事件协议严格校验，并生成到仓库的持久化目录。
- 运维者必须配置 SMTP 授权码，并接受 SMTP 与日志标记之间发生进程故障时可能出现的一次重复投递。
- Web bundle 已在“插件”设置页提供可展开的可视化配置卡，可编辑 SMTP、收件人、发送时间、时区、发件地址、主题、重试间隔和启用开关；授权码仍是只写凭据控件。Web 组合中的插件默认关闭并使用不会发信的占位值，运维者完成配置后再启用投递。
