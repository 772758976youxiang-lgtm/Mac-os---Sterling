# `@deepseek-ai/dsh-email-digest`

[English](README.md) | 中文

通过 SMTP 发送邮件，以面向模型的 MCP 工具形式暴露。插件注册 `mcp__email__send`，Agent 在处理完定时提醒后调用它，把结果推送到配置的或调用方指定的收件人。没有固定的每日定时推送。

## 配置

插件需要一个 SMTP 账号和至少一个默认收件人。`passwordRef` 是每次发送都通过 `ctx.credentials` 解析的凭据引用；密码本身不会进入组合配置或 Session 日志。

```yaml
- id: email-digest
  name: '@deepseek-ai/dsh-email-digest'
  config:
    enabled: true
    smtp:
      host: smtp.qq.com
      port: 465
      secure: true
      username: bot@qq.com
      passwordRef: DSH_EMAIL_SMTP_PASSWORD
    recipients: [me@example.com]
    from: bot@qq.com
```

QQ 和 163 邮箱需要使用服务商提供的 SMTP 客户端授权码，而不是网页登录密码。将授权码写入 `$DSH_HOME/.credentials.yaml`，或写入配置引用对应的进程环境变量。凭据变更会在下一次发送时生效，不需要重启插件。

Web bundle 会在“设置 → 插件 → 邮件发送”中提供这些配置和启用开关。授权码控件只写入凭据并显示配置状态，不会回读密钥。

## 模型体验

插件注册一个工具 `mcp__email__send`，参数为 `to`（可选，逗号分隔；缺省用配置的收件人）、`subject`、`body` 和可选的 `html`。Agent 调用它来发送结果。对定时提醒，把提醒文案写成“处理完后调用 mcp__email__send 推送结果”即可——插件本身不再有固定的发送时间。

发送在工具调用内同步完成：SMTP 确认接受后工具才返回成功，失败会作为工具错误抛出。是否重试由模型决定。

## 已知限制与延期工作

- **仅 SMTP**：OAuth 刷新、服务商专用 API 投递和收件箱管理不在本插件范围内。
- **单一默认目的地**：调用方可按次用 `to` 覆盖，但不支持跨 Session 汇总或附件。
