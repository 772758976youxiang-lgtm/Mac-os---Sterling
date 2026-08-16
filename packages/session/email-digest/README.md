# `@deepseek-ai/dsh-email-digest`

English | [中文](README.zh.md)

Optional SMTP delivery for completed Session-local Schedule reminders. The plugin observes future live root Agents, records the assistant response to each scheduled follow-up in the owning Session log, and sends each live root Session's undelivered responses as one daily digest to configured recipients.

## Configuration

The plugin requires an SMTP account and at least one recipient. `passwordRef` is a credential reference resolved through `ctx.credentials` for every delivery; the password itself never enters the composition or Session log.

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

QQ and 163 accounts require their provider-issued SMTP client authorization code, not the web login password. Put it in `$DSH_HOME/.credentials.yaml` or the process environment under the configured reference. A changed credential reaches the next attempted send without restarting the plugin.

The Web bundle exposes these values in Settings > Plugins > Email digest, including an enable switch. The authorization code field is write-only and reports configuration status without reading the secret back.

`sendAt` is interpreted in the configured IANA zone. A failed send retries after `retryMinutes` (15 by default). A successful SMTP send appends a durable delivery marker; a crash between SMTP acceptance and that append can produce a duplicate digest, so delivery is at-least-once.

The plugin does not wake cold Sessions or send external mail for them. A Session must be live under a root Agent for its completed scheduled responses to participate. Results are stored as `email-digest/change` events and survive normal Session persistence and restart.

## Model Experience

The plugin adds no model-facing tool. The existing `schedule_create`, `schedule_list`, and `schedule_delete` tools remain the user and model control surface; the email digest is an operational delivery projection of their ordinary follow-up responses.

## Known Limitations and Deferred Work

- **Live roots only** — a cold Session is included after it resumes, not through a process-wide persistence scan.
- **One configured destination** — all live root Sessions share the configured recipient list; each Session sends independently, and per-task recipients, cross-Session aggregation, and attachments are not supported.
- **SMTP only** — OAuth refresh, provider-specific API transports, and inbound mailbox management are outside this plugin.
