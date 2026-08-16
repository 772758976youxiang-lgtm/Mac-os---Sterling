/** Optional daily SMTP digest for completed Session-local Schedule reminders. @module @deepseek-ai/dsh-email-digest */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { DigestItem } from './types.ts'
import {
  foldEmailDigestEvents,
  pendingDigestItems,
  renderDigestHtml,
  renderDigestText,
} from './domain.ts'
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
/** Services used by the live root-agent collector and SMTP sender. */
export const inject = ['agents', 'sessions', 'credentials', 'sessionPersistence']

/** User-settings namespace exposed to the visual Plugins configuration page. */
export const EMAIL_DIGEST_SETTINGS_NAMESPACE = settingsNamespace('email-digest')

/** Flat user-owned projection used by the browser settings form. */
export interface EmailDigestSettings {
  enabled: boolean
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  smtpUsername: string
  passwordRef: string
  recipients: string
  sendAt: string
  timeZone: string
  from: string
  subject: string
  retryMinutes: number
}

/** Schema for the flat settings projection; composition supplies its base values. */
export const EmailDigestSettingsConfig: z<EmailDigestSettings> = z.object({
  enabled: z.boolean(),
  smtpHost: z.string().min(1),
  smtpPort: z.number(),
  smtpSecure: z.boolean(),
  smtpUsername: z.string().min(1),
  passwordRef: z.string().min(1),
  recipients: z.string().min(1),
  sendAt: z.string().min(1),
  timeZone: z.string().min(1),
  from: z.string().min(1),
  subject: z.string().min(1),
  retryMinutes: z.number(),
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
    sendAt: config.sendAt,
    timeZone: config.timeZone,
    from: config.from,
    subject: config.subject,
    retryMinutes: config.retryMinutes,
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
    sendAt: settings.sendAt,
    timeZone: settings.timeZone,
    from: settings.from,
    subject: settings.subject,
    retryMinutes: settings.retryMinutes,
  }
}

/** SMTP and daily delivery configuration. Secrets are credential references, not values. */
export interface Config {
  /** Whether collection and delivery are active. Defaults to true for composed users. */
  enabled?: boolean
  smtp: {
    host: string
    port?: number
    secure?: boolean
    username: string
    passwordRef: string
  }
  /** At least one recipient address. */
  recipients: string[]
  /** Local wall-clock send time in `HH:mm`. */
  sendAt: string
  /** IANA zone used to interpret `sendAt`; defaults to the process zone. */
  timeZone?: string
  /** Sender address; defaults to `smtp.username`. */
  from?: string
  /** Subject prefix; defaults to `Sterling Harness daily digest`. */
  subject?: string
  /** Retry delay after a failed send; defaults to 15 minutes. */
  retryMinutes?: number
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
  recipients: z.array(z.string().min(1)).min(1),
  sendAt: z.string().min(1),
  timeZone: z.string(),
  from: z.string(),
  subject: z.string(),
  retryMinutes: z.number(),
})

interface ResolvedConfig {
  readonly enabled: boolean
  readonly smtp: Required<Config['smtp']>
  readonly recipients: readonly string[]
  readonly sendAt: string
  readonly timeZone: string
  readonly from: string
  readonly subject: string
  readonly retryMinutes: number
}

const EMAIL = /^[^\s@]+@[^\s@]+$/
const LOCAL_TIME = /^(?<hour>[01]\d|2[0-3]):(?<minute>[0-5]\d)$/
const MAX_TIMER_DELAY_MS = 2_147_483_647

function resolveConfig(config: Config): ResolvedConfig {
  // Validate the reference shape at load time; the value is still resolved only per send.
  credentialRef(config.smtp.passwordRef)
  const timeZone = config.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone }).format()
  } catch (error: unknown) {
    throw new TypeError(`email-digest: invalid IANA timeZone ${JSON.stringify(timeZone)}`, { cause: error })
  }
  if (config.recipients.some(recipient => !EMAIL.test(recipient))) {
    throw new TypeError('email-digest: recipients must contain valid email addresses')
  }
  if (!EMAIL.test(config.smtp.username) || !EMAIL.test(config.from ?? config.smtp.username)) {
    throw new TypeError('email-digest: smtp.username and from must be email addresses')
  }
  if (!LOCAL_TIME.test(config.sendAt)) throw new TypeError('email-digest: sendAt must use HH:mm')
  const port = config.smtp.port ?? (config.smtp.secure === true ? 465 : 587)
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new TypeError('email-digest: smtp.port must be an integer from 1 to 65535')
  }
  const retryMinutes = config.retryMinutes ?? 15
  if (!Number.isSafeInteger(retryMinutes) || retryMinutes < 1 || retryMinutes > 1_440) {
    throw new TypeError('email-digest: retryMinutes must be an integer from 1 to 1440')
  }
  return {
    enabled: config.enabled ?? true,
    smtp: {
      ...config.smtp,
      port,
      secure: config.smtp.secure ?? port === 465,
    },
    recipients: [...config.recipients],
    sendAt: config.sendAt,
    timeZone,
    from: config.from ?? config.smtp.username,
    subject: config.subject ?? 'Sterling Harness daily digest',
    retryMinutes,
  }
}

interface TimeZoneDateParts {
  readonly year: number
  readonly month: number
  readonly day: number
  readonly hour: number
  readonly minute: number
}

function timeZoneDateParts(epoch: number, timeZone: string): TimeZoneDateParts {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(epoch).map(part => [part.type, part.value])) as Record<string, string>
  return {
    year: Number(parts['year']),
    month: Number(parts['month']),
    day: Number(parts['day']),
    hour: Number(parts['hour']),
    minute: Number(parts['minute']),
  }
}

function localDateKey(epoch: number, timeZone: string): string {
  const parts = timeZoneDateParts(epoch, timeZone)
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

function nextLocalDate(parts: TimeZoneDateParts): TimeZoneDateParts {
  const next = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1))
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
    hour: parts.hour,
    minute: parts.minute,
  }
}

function epochAtLocalTime(date: TimeZoneDateParts, hour: number, minute: number, timeZone: string): number {
  const target = Date.UTC(date.year, date.month - 1, date.day, hour, minute)
  let candidate = target
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const observed = timeZoneDateParts(candidate, timeZone)
    const observedAsUtc = Date.UTC(observed.year, observed.month - 1, observed.day, observed.hour, observed.minute)
    const difference = target - observedAsUtc
    if (difference === 0) return candidate
    candidate += difference
  }
  // A local daylight-saving gap has no exact epoch. Use the timezone runtime's
  // next representable wall-clock instant rather than skipping the whole day.
  return candidate
}

function targetEpoch(now: number, config: ResolvedConfig): number {
  const current = timeZoneDateParts(now, config.timeZone)
  const match = LOCAL_TIME.exec(config.sendAt)
  if (match?.groups === undefined) throw new Error('email-digest: invalid resolved sendAt')
  const hour = Number(match.groups['hour'])
  const minute = Number(match.groups['minute'])
  const todayTarget = epochAtLocalTime(current, hour, minute, config.timeZone)
  if (todayTarget > now) return todayTarget
  return epochAtLocalTime(nextLocalDate(current), hour, minute, config.timeZone)
}

function textFromMessage(event: Extract<SessionEvent, { type: 'assistant/message' }>): string {
  return event.data.message.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('')
    .trim()
}

function reminderSource(session: Agent['session'], turn: number): { prompt: string; scheduleId?: string } | undefined {
  for (const event of [...session.events].reverse()) {
    if (event.type === 'turn/start' && event.data.turn === turn) break
    if (event.type !== 'user/message' || event.data.source.kind !== 'plugin' || event.data.source.plugin !== 'schedule') continue
    const text = event.data.content.filter(block => block.type === 'text').map(block => block.text).join('\n')
    const valueAfter = (label: string): string | undefined => {
      const raw = text.split('\n').find(line => line.startsWith(`${label}: `))?.slice(label.length + 2)
      if (raw === undefined) return undefined
      try {
        const parsed: unknown = JSON.parse(raw)
        return typeof parsed === 'string' ? parsed : undefined
      } catch {
        return undefined
      }
    }
    const scheduleId = valueAfter('schedule_id_json')
    return {
      prompt: valueAfter('reminder_prompt_json') ?? 'Scheduled reminder',
      ...(scheduleId === undefined ? {} : { scheduleId }),
    }
  }
  return undefined
}

function collectId(session: Agent['session'], eventSeq: number): string {
  return `${String(session.id)}:${String(eventSeq)}`
}

class DigestRuntime {
  private timer: ReturnType<typeof setTimeout> | undefined
  private disposed = false
  private running = false
  private retryAt: number | undefined

  constructor(
    private readonly ctx: Context,
    private readonly agent: Agent,
    private readonly configSource: () => ResolvedConfig,
  ) {}

  private get config(): ResolvedConfig { return this.configSource() }

  start(): void { this.requestDrive() }

  requestDrive(): void {
    if (this.disposed || this.timer !== undefined) return
    const now = Date.now()
    const target = this.retryAt ?? targetEpoch(now, this.config)
    const delay = Math.max(0, target - now)
    this.timer = setTimeout(() => {
      this.timer = undefined
      void this.drive(true)
    }, Math.min(delay, MAX_TIMER_DELAY_MS))
  }

  collect(event: Extract<SessionEvent, { type: 'assistant/message' }>): void {
    const source = reminderSource(this.agent.session, event.data.turn)
    const response = textFromMessage(event)
    if (source === undefined || response.length === 0) return
    const id = collectId(this.agent.session, event.seq)
    if (this.agent.session.events.some(candidate => candidate.type === 'email-digest/change'
      && candidate.data.operation === 'collect' && candidate.data.item.id === id)) return
    queueMicrotask(() => {
      if (this.disposed) return
      try {
        const item: DigestItem = {
          id,
          sessionId: this.agent.session.id,
          ...source,
          prompt: source.prompt,
          response,
          collectedAt: new Date(event.time).toISOString(),
        }
        this.agent.session.append('email-digest/change', { version: 1, operation: 'collect', item })
      } catch (error: unknown) {
        this.ctx.logger.warn(`email-digest: failed to persist result for session "${this.agent.session.id}": ${String(error)}`)
      }
    })
  }

  dispose(): Promise<void> {
    this.disposed = true
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
    return Promise.resolve()
  }

  private async drive(due = false): Promise<void> {
    if (this.disposed || this.running) return
    this.running = true
    try {
      const now = Date.now()
      if (this.retryAt !== undefined && now < this.retryAt) return
      if (this.retryAt === undefined && !due) return
      await this.sendPending()
      this.retryAt = undefined
    } catch (error: unknown) {
      this.retryAt = Date.now() + this.config.retryMinutes * 60_000
      this.ctx.logger.warn(`email-digest: daily delivery failed for session "${this.agent.session.id}": ${String(error)}`)
    } finally {
      this.running = false
      this.requestDrive()
    }
  }

  private async sendPending(): Promise<void> {
    const fold = foldEmailDigestEvents(this.agent.session.events, this.agent.session.header.seedLength ?? 0)
    const items = pendingDigestItems(fold)
      .filter(item => Date.parse(item.collectedAt) <= Date.now())
    if (items.length === 0) return
    const password = await this.ctx.credentials.resolve(credentialRef(this.config.smtp.passwordRef))
    if (password === undefined) throw new Error(`credential "${this.config.smtp.passwordRef}" is not configured`)
    const day = localDateKey(Date.now(), this.config.timeZone)
    const spec: SmtpSpec = {
      ...this.config.smtp,
      username: this.config.smtp.username,
      password: password.value,
      from: this.config.from,
      recipients: this.config.recipients,
    }
    await sendSmtpDigest(spec, {
      subject: `${this.config.subject} - ${day}`,
      text: renderDigestText(items, day),
      html: renderDigestHtml(items, day),
    })
    this.agent.session.append('email-digest/change', {
      version: 1,
      operation: 'deliver',
      day,
      itemIds: items.map(item => item.id),
      deliveredAt: new Date().toISOString(),
    })
    await this.ctx.sessions.flush(this.agent.session)
  }
}

/** Install the optional collector and SMTP digest owner for future root Agents. */
export function apply(ctx: Context, rawConfig: Config): void {
  let currentConfig = resolveConfig(rawConfig)
  const runtimes = new Map<Agent, DigestRuntime>()
  let stopping = false

  const startRuntime = (agent: Agent): void => {
    if (!currentConfig.enabled || stopping || runtimes.has(agent)) return
    const runtime = new DigestRuntime(ctx, agent, () => currentConfig)
    runtimes.set(agent, runtime)
    agent.ctx.effect(() => {
      const stopEvent = ctx.on('session/event', (session, event) => {
        if (session !== agent.session || event.type !== 'assistant/message') return
        runtime.collect(event)
      })
      const stopDisposed = ctx.on('agent/disposed', ({ agent: disposed }) => {
        if (disposed !== agent) return
        void runtime.dispose()
      })
      runtime.start()
      return async () => {
        stopEvent()
        stopDisposed()
        await runtime.dispose()
        runtimes.delete(agent)
      }
    }, 'email-digest.runtime()')
  }

  const stopRuntime = async (agent: Agent): Promise<void> => {
    const runtime = runtimes.get(agent)
    if (runtime !== undefined) {
      await runtime.dispose()
      runtimes.delete(agent)
    }
  }

  const baseSettings = settingsOf(currentConfig)
  installSettingsSection(ctx, EMAIL_DIGEST_SETTINGS_NAMESPACE, EmailDigestSettingsConfig, baseSettings, {
    validate: (value) => { resolveConfig(configFromSettings(value)) },
    setSource: (source) => { currentConfig = resolveConfig(configFromSettings(source())) },
    onChange: () => {
      for (const agent of ctx.agents.roots()) {
        if (currentConfig.enabled) startRuntime(agent)
        else void stopRuntime(agent)
      }
    },
  })

  const stopCreated = ctx.on('agent/created', ({ agent }) => {
    if (!ctx.agents.roots().includes(agent)) return
    startRuntime(agent)
  })

  ctx.effect(() => async () => {
    stopping = true
    stopCreated()
    await Promise.allSettled([...runtimes.values()].map(runtime => runtime.dispose()))
    runtimes.clear()
  }, 'email-digest.lifecycle()')
}
