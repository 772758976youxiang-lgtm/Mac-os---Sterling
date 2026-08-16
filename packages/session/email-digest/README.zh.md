# `@deepseek-ai/dsh-email-digest`

[English](README.md) | 中文

用于已完成 Session-local Schedule 提醒的可选 SMTP 投递插件。插件观察后续创建的 live 根 Agent，将每条定时 follow-up 的 assistant 回复记录到所属 Session 日志，并将每个 live 根 Session 尚未投递的回复合并成每日摘要，发送给配置的收件人。

## 配置

插件需要 SMTP 账号和至少一个收件人。`passwordRef` 是通过 `ctx.credentials` 解析的凭据引用，每次投递都会重新解析；密码本身不会进入组合配置或 Session 日志。

```yaml
- id: email-digest
  name: '@deepseek-ai/dsh-email-digest'
  config:
    smtp:
      host: smtp.qq.com
      port: 465
      secure: true
      username: bot@qq.com
      passwordRef: DSH_EMAIL_SMTP_PASSWORD
    recipients: [me@example.com]
    sendAt: '18:00'
    timeZone: Asia/Shanghai
```

QQ 和 163 邮箱需要使用服务商提供的 SMTP 客户端授权码，而不是网页登录密码。将授权码写入 `$DSH_HOME/.credentials.yaml`，或写入配置引用对应的进程环境变量。凭据变更会在下一次发送尝试时生效，不需要重启插件。

Web bundle 会在“设置 → 插件 → 邮件日报”中提供这些配置和启用开关。授权码控件只写入凭据并显示配置状态，不会回读密钥。

`sendAt` 按配置的 IANA 时区解释。发送失败后会在 `retryMinutes`（默认 15 分钟）后重试。SMTP 成功后追加持久化投递标记；如果 SMTP 已接受邮件但进程在追加标记前崩溃，日报可能重复发送，因此投递语义是至少一次。

插件不会唤醒 cold Session，也不会为 cold Session 发送外部邮件。Session 必须由根 Agent 保持 live，才能参与已完成定时回复的日报。结果以 `email-digest/change` 事件保存，正常的 Session 持久化和重启会保留它们。

## 模型体验

插件不会增加面向模型的工具。现有的 `schedule_create`、`schedule_list` 与 `schedule_delete` 仍是用户和模型的控制面；邮件日报只是这些普通 follow-up 回复的运行时投递投影。

## 已知限制与延期工作

- **仅处理 live 根 Agent**：cold Session 恢复后才会加入，不执行进程级持久化扫描。
- **一个统一目的地**：所有 live 根 Session 共用配置的收件人列表，但每个 Session 独立发送；不支持按任务指定收件人、跨 Session 汇总或附件。
- **仅 SMTP**：OAuth 刷新、服务商专用 API 投递和收件箱管理不在本插件范围内。
