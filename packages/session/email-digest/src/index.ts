/** SMTP email delivery exposed as a model-facing MCP tool. @module @deepseek-ai/dsh-email-digest */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolResult } from '@deepseek-ai/dsh-tools'
import { sendSmtpDigest } from './mailer.ts'
import type { SmtpSpec } from './mailer.ts'

export type * from './types.ts'
export {
  EMAIL_DIGEST_CHANGE_VERSION,
  EmailDigestLogError,
  decodeEmailDigestChange,
  foldEmailDigestEvents,
  pendingDigestItems,
  renderDigestHtml,
  renderDigestText,
} from './domain.ts'
export type { DigestMail, SmtpSpec } from './mailer.ts'
export { sendSmtpDigest } from './mailer.ts'

/** Cordis function-plugin name. */
export const name = 'email-digest'
/** Services used by the SMTP sender and the MCP email tool. */
export const inject = ['tools', 'credentials']

/** Public MCP-style tool name available to text models. */
export const EMAIL_SEND_TOOL = 'mcp__email__send'
/** User-settings namespace exposed to the visual Plugins configuration page. */
export const EMAIL_DIGEST_SETTINGS_NAMESPACE = settingsNamespace('email-digest')

/** Cooperative upper bound for one SMTP send. */
const EMAIL_SEND_TIMEOUT_MS = 60_000

/** Flat user-owned projection used by the browser settings form. */
export interface EmailDigestSettings {
  enabled: boolean
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  smtpUsername: string
  passwordRef: string
  recipients: string
  from: string
}

/** Schema for the flat settings projection; composition supplies its base values. */
export const EmailDigestSettingsConfig: z<EmailDigestSettings> = z.object({
  enabled: z.boolean(),
  smtpHost: z.string().min(1),
  smtpPort: z.number(),
  smtpSecure: z.boolean(),
  smtpUsername: z.string().min(1),
  passwordRef: z.string().min(1),
  recipients: z.string(),
  from: z.string().min(1),
})

function settingsOf(config: ResolvedConfig): EmailDigestSettings {
  return {
    enabled: config.enabled,
    smtpHost: config.smtp.host,
    smtpPort: config.smtp.port,
    smtpSecure: config.smtp.secure,
    smtpUsername: config.smtp.username,
    passwordRef: config.smtp.passwordRef,
    recipients: config.recipients.join(', '),
    from: config.from,
  }
}

function configFromSettings(settings: EmailDigestSettings): Config {
  return {
    enabled: settings.enabled,
    smtp: {
      host: settings.smtpHost,
      port: settings.smtpPort,
      secure: settings.smtpSecure,
      username: settings.smtpUsername,
      passwordRef: settings.passwordRef,
    },
    recipients: settings.recipients.split(',').map(value => value.trim()).filter(Boolean),
    from: settings.from,
  }
}

/** SMTP delivery configuration. Secrets are credential references, not values. */
export interface Config {
  /** Whether the email tool is active. Defaults to true for composed users. */
  enabled?: boolean
  /** SMTP connection parameters and the credential reference used for authentication. */
  smtp: {
    /** SMTP server hostname. */
    host: string
    /** SMTP server port; defaults to 465 for secure delivery and 587 otherwise. */
    port?: number
    /** Use TLS for the SMTP connection. */
    secure?: boolean
    /** Authenticated SMTP mailbox address. */
    username: string
    /** Credential reference that resolves to the SMTP mailbox password. */
    passwordRef: string
  }
  /** Optional default recipient addresses; tasks can supply their own via the `to` tool argument. */
  recipients: string[]
  /** Sender address; defaults to `smtp.username`. */
  from?: string
}

/** Schemastery validation for {@link Config}. */
export const Config: z<Config> = z.object({
  enabled: z.boolean().default(true),
  smtp: z.object({
    host: z.string().min(1),
    port: z.number(),
    secure: z.boolean(),
    username: z.string().min(1),
    passwordRef: z.string().min(1),
  }),
  recipients: z.array(z.string().min(1)),
  from: z.string(),
})

interface ResolvedConfig {
  readonly enabled: boolean
  readonly smtp: Required<Config['smtp']>
  readonly recipients: readonly string[]
  readonly from: string
}

const EMAIL = /^[^\s@]+@[^\s@]+$/

function resolveConfig(config: Config): ResolvedConfig {
  credentialRef(config.smtp.passwordRef)
  if (config.recipients.some(recipient => !EMAIL.test(recipient))) {
    throw new TypeError('email-digest: recipients must contain valid email addresses')
  }
  if (!EMAIL.test(config.smtp.username) || !EMAIL.test(config.from ?? config.smtp.username)) {
    throw new TypeError('email-digest: smtp.username and from must be email addresses')
  }
  const port = config.smtp.port ?? (config.smtp.secure === true ? 465 : 587)
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new TypeError('email-digest: smtp.port must be an integer from 1 to 65535')
  }
  return {
    enabled: config.enabled ?? true,
    smtp: {
      ...config.smtp,
      port,
      secure: config.smtp.secure ?? port === 465,
    },
    recipients: [...config.recipients],
    from: config.from ?? config.smtp.username,
  }
}

/** Minimal HTML escaping for the fallback HTML body. */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/** Parse a comma-separated recipient string, falling back to the configured list. */
function resolveRecipients(raw: string | undefined, configured: readonly string[]): string[] {
  if (raw === undefined || raw.trim() === '') return [...configured]
  const parsed = raw.split(',').map(value => value.trim()).filter(Boolean)
  return parsed.length === 0 ? [...configured] : parsed
}

/** Model-facing completion returned after a successful send. */
interface SendValue {
  sent: true
  recipients: string[]
  subject: string
}

function sendText(value: SendValue): string {
  return `Email sent to ${value.recipients.join(', ')} with subject "${value.subject}".`
}

/** Install the SMTP settings section and register the model-facing MCP email tool. */
export function apply(ctx: Context, rawConfig: Config): void {
  let currentConfig = resolveConfig(rawConfig)

  const baseSettings = settingsOf(currentConfig)
  installSettingsSection(ctx, EMAIL_DIGEST_SETTINGS_NAMESPACE, EmailDigestSettingsConfig, baseSettings, {
    validate: (value) => { resolveConfig(configFromSettings(value)) },
    setSource: (source) => { currentConfig = resolveConfig(configFromSettings(source())) },
    onChange: () => {},
  })

  ctx.tools.register(defineTool({
    name: EMAIL_SEND_TOOL,
    description:
      'Send one email through the configured SMTP account. Call this after handling a scheduled reminder '
      + 'to push the result to the user, or whenever the user asks to email something. `to` sets the '
      + 'recipients for this send (per-task override); when omitted the configured default recipients are '
      + 'used, and the send fails clearly if neither exists. `from_name` sets the sender display name '
      + 'shown instead of the bare address.',
    parameters: {
      to: {
        type: 'string',
        description:
          'Comma-separated recipient addresses for this send. Prefer setting the task recipient here; '
          + 'falls back to the configured recipients when omitted.',
      },
      from_name: {
        type: 'string',
        description:
          'Optional sender display name, e.g. "Sterling Harness - 定时推送" for scheduled pushes or '
          + '"Sterling Harness - 临时推送" for one-off pushes.',
      },
      subject: { type: 'string', required: true, description: 'Email subject line.' },
      body: { type: 'string', required: true, description: 'Plain-text email body.' },
      html: {
        type: 'string',
        description: 'Optional HTML body; defaults to an escaped version of `body`.',
      },
    },
    timeoutMs: EMAIL_SEND_TIMEOUT_MS,
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          sent: { type: 'boolean', required: true, const: true },
          recipients: { type: 'array', required: true, items: { type: 'string' } },
          subject: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: sendText(value as SendValue) }],
    },
    isConcurrencySafe: () => true,
    async execute(args, _exec): Promise<SendValue> {
      const config = currentConfig
      if (!config.enabled) {
        throw new Error('email-digest: email delivery is disabled; enable it in the Plugins settings')
      }
      const subject = args.subject.trim()
      if (subject === '') throw new Error('subject must not be empty')
      const recipients = resolveRecipients(args.to, config.recipients)
      if (recipients.length === 0) {
        throw new Error('email-digest: no recipients; pass `to` or configure default recipients in the email settings')
      }
      if (recipients.some(recipient => !EMAIL.test(recipient))) {
        throw new Error('email-digest: `to` must contain valid email addresses')
      }
      const password = await ctx.credentials.resolve(credentialRef(config.smtp.passwordRef))
      if (password === undefined) {
        throw new Error(`email-digest: credential "${config.smtp.passwordRef}" is not configured`)
      }
      const fromName = args.from_name?.trim()
      const spec: SmtpSpec = {
        ...config.smtp,
        username: config.smtp.username,
        password: password.value,
        from: config.from,
        ...(fromName === undefined || fromName === '' ? {} : { fromName }),
        recipients,
      }
      await sendSmtpDigest(spec, {
        subject,
        text: args.body,
        html: args.html ?? escapeHtml(args.body),
      })
      return { sent: true, recipients, subject }
    },
    presentCall(args) {
      return { card: 'generic', title: 'Send email', kind: 'other', rawInput: args.subject }
    },
    presentResult(_args, result: ToolResult) {
      return result.isError ? undefined : { card: 'generic', title: 'Email sent' }
    },
  }))
}
