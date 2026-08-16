import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import AgentRegistry, { Inbox } from '@deepseek-ai/dsh-agent'
import type { Agent, AgentCancelCause, InboxTarget } from '@deepseek-ai/dsh-agent'
import { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import type { CredentialInfo, CredentialRef, ResolvedCredential } from '@deepseek-ai/dsh-credentials'
import { createMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import * as EmailDigestPlugin from '../src/index.ts'

const { sendSmtpDigest } = vi.hoisted(() => ({ sendSmtpDigest: vi.fn(async () => {}) }))

vi.mock('../src/mailer.ts', () => ({ sendSmtpDigest }))

class MemoryCredentials extends CredentialProvider {
  override resolve(_ref: CredentialRef): Promise<ResolvedCredential | undefined> {
    return Promise.resolve({ value: 'smtp-authorization-code', source: 'memory' })
  }

  override describe(_ref: CredentialRef): Promise<CredentialInfo> {
    return Promise.resolve({ configured: true, source: 'memory', writable: false })
  }

  override set(_ref: CredentialRef, _value: string): Promise<void> { return Promise.resolve() }
  override unset(_ref: CredentialRef): Promise<void> { return Promise.resolve() }
}

class PersistenceProbe extends Service {
  constructor(ctx: Context) { super(ctx, 'sessionPersistence') }
}

const contexts: Context[] = []

function rootAgent(ctx: Context): Agent {
  const session = ctx.sessions.create(SessionId('email-digest-root'))
  return {
    id: session.id,
    options: {},
    session,
    inbox: new Inbox(session, { inserted: () => {}, discarded: () => {}, claimed: () => {} }),
    status: 'idle',
    ctx: new Context(),
    send(_message: UserMessage, _target: InboxTarget, _wakeup: boolean) {},
    followup(_message: UserMessage) {},
    steer(_message: UserMessage) {},
    inject(_message: UserMessage) {},
    cancel(_cause: AgentCancelCause) {},
    runMaintenance<T>(task: (signal: AbortSignal) => Promise<T>): Promise<T> {
      return task(new AbortController().signal)
    },
    whenIdle(): Promise<void> { return Promise.resolve() },
  }
}

async function settle(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve()
  await vi.advanceTimersByTimeAsync(0)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-16T09:59:00.000Z'))
})

afterEach(async () => {
  await Promise.allSettled(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('email digest plugin composition', () => {
  it('has the Loader-safe function-plugin export shape', () => {
    expect('default' in EmailDigestPlugin).toBe(false)
    expect(EmailDigestPlugin.name).toBe('email-digest')
    expect(EmailDigestPlugin.inject).toEqual(['agents', 'sessions', 'credentials', 'sessionPersistence'])
  })

  it('collects a completed Schedule response and marks it delivered only after SMTP accepts it', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(SessionStore)
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(MemoryCredentials)
    await ctx.plugin(PersistenceProbe)
    await ctx.plugin(EmailDigestPlugin, {
      smtp: { host: 'smtp.qq.com', username: 'bot@qq.com', passwordRef: 'SMTP_AUTH_CODE' },
      recipients: ['owner@example.com'],
      sendAt: '18:00',
      timeZone: 'Asia/Shanghai',
    })
    const agent = rootAgent(ctx)
    const stop = ctx.agents.register(agent)
    await settle()

    agent.session.append('turn/start', { turn: 1 })
    agent.session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: [
        '[SCHEDULE REMINDER]',
        'schedule_id_json: "schedule-1"',
        'reminder_prompt_json: "collect status"',
      ].join('\n') }],
      source: { kind: 'plugin', plugin: 'schedule' },
    }), { surfaceOp: 'append' })
    agent.session.append('step/start', { turn: 1, step: 1 })
    agent.session.append('assistant/message', {
      turn: 1,
      step: 1,
      message: createMessage({
        role: 'assistant',
        content: [{ type: 'text', text: 'The collection completed successfully.' }],
        source: { kind: 'model', provider: 'mock', model: 'mock' },
      }),
    }, { surfaceOp: 'append' })
    await settle()

    expect(agent.session.events.find(event => event.type === 'email-digest/change')?.data)
      .toMatchObject({ operation: 'collect', item: { prompt: 'collect status' } })
    await vi.advanceTimersByTimeAsync(60_000)
    await settle()

    expect(sendSmtpDigest).toHaveBeenCalledOnce()
    expect(agent.session.events.findLast(event => event.type === 'email-digest/change')?.data)
      .toMatchObject({ operation: 'deliver', itemIds: [expect.any(String)] })
    stop()
  })
})
