# `@deepseek-ai/dsh-email-digest`

English | [中文](README.zh.md)

SMTP email delivery exposed as a model-facing MCP tool. The plugin registers `mcp__email__send`, which the agent calls — for example right after handling a scheduled reminder — to push a message to configured or caller-supplied recipients. There is no fixed daily send timer.

## Configuration

The plugin requires an SMTP account and at least one default recipient. `passwordRef` is a credential reference resolved through `ctx.credentials` for every send; the password itself never enters the composition or Session log.

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

QQ and 163 accounts require their provider-issued SMTP client authorization code, not the web login password. Put it in `$DSH_HOME/.credentials.yaml` or the process environment under the configured reference. A changed credential reaches the next send without restarting the plugin.

The Web bundle exposes these values in Settings > Plugins > Email delivery, including an enable switch. The authorization code field is write-only and reports configuration status without reading the secret back.

## Model Experience

The plugin registers one tool, `mcp__email__send`, with parameters `to` (optional, comma-separated; defaults to the configured recipients), `subject`, `body`, and optional `html`. The agent calls it to email a result. For scheduled reminders, write the reminder prompt so the agent calls `mcp__email__send` after finishing — the plugin itself imposes no send time.

Delivery is synchronous inside the tool call: SMTP acceptance is awaited before the tool returns success, and failures surface as tool errors. Retry is the model's decision.

## Known Limitations and Deferred Work

- **SMTP only** — OAuth refresh, provider-specific API transports, and inbound mailbox management are outside this plugin.
- **One configured default destination** — callers can override `to` per send, but cross-Session aggregation and attachments are not supported.
