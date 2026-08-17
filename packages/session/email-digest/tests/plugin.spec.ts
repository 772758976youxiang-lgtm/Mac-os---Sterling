import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import type { CredentialInfo, CredentialRef, ResolvedCredential } from '@deepseek-ai/dsh-credentials'
import { CallId } from '@deepseek-ai/dsh-llm'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
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

const contexts: Context[] = []

async function harness(config: EmailDigestPlugin.Config): Promise<Context> {
  const ctx = new Context()
  contexts.push(ctx)
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(MemoryCredentials)
  await ctx.plugin(EmailDigestPlugin, config)
  return ctx
}

afterEach(async () => {
  await Promise.allSettled(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  vi.clearAllMocks()
})

describe('email delivery plugin composition', () => {
  it('has the Loader-safe function-plugin export shape', () => {
    expect('default' in EmailDigestPlugin).toBe(false)
    expect(EmailDigestPlugin.name).toBe('email-digest')
    expect(EmailDigestPlugin.inject).toEqual(['tools', 'credentials'])
  })

  it('registers mcp__email__send and delivers through SMTP with resolved credentials', async () => {
    const ctx = await harness({
      smtp: { host: 'smtp.qq.com', username: 'bot@qq.com', passwordRef: 'SMTP_AUTH_CODE' },
      recipients: ['owner@example.com'],
    })

    expect(ctx.tools.get(EmailDigestPlugin.EMAIL_SEND_TOOL)?.name).toBe('mcp__email__send')

    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: CallId('email-send'),
      name: EmailDigestPlugin.EMAIL_SEND_TOOL,
      arguments: { subject: 'Reminder', body: 'Please place the logistics order.' },
    })
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected email send value')
    expect(result.value).toEqual({
      sent: true,
      recipients: ['owner@example.com'],
      subject: 'Reminder',
    })

    expect(sendSmtpDigest).toHaveBeenCalledOnce()
    expect(sendSmtpDigest).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.qq.com',
        username: 'bot@qq.com',
        password: 'smtp-authorization-code',
        from: 'bot@qq.com',
        recipients: ['owner@example.com'],
      }),
      expect.objectContaining({
        subject: 'Reminder',
        text: 'Please place the logistics order.',
      }),
    )
  })

  it('defaults recipients to the configured list when `to` is omitted', async () => {
    const ctx = await harness({
      smtp: { host: 'smtp.qq.com', username: 'bot@qq.com', passwordRef: 'SMTP_AUTH_CODE' },
      recipients: ['a@example.com', 'b@example.com'],
    })

    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: CallId('email-send-default'),
      name: EmailDigestPlugin.EMAIL_SEND_TOOL,
      arguments: { subject: 'S', body: 'B' },
    })
    expect(result.isError).toBe(false)
    expect(sendSmtpDigest).toHaveBeenCalledWith(
      expect.objectContaining({ recipients: ['a@example.com', 'b@example.com'] }),
      expect.anything(),
    )
  })

  it('passes the sender display name through when provided', async () => {
    const ctx = await harness({
      smtp: { host: 'smtp.qq.com', username: 'bot@qq.com', passwordRef: 'SMTP_AUTH_CODE' },
      recipients: ['owner@example.com'],
    })

    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: CallId('email-send-named'),
      name: EmailDigestPlugin.EMAIL_SEND_TOOL,
      arguments: { from_name: 'Sterling Harness - 临时推送', subject: 'S', body: 'B' },
    })
    expect(result.isError).toBe(false)
    expect(sendSmtpDigest).toHaveBeenCalledWith(
      expect.objectContaining({ fromName: 'Sterling Harness - 临时推送' }),
      expect.anything(),
    )
  })

  it('fails clearly when neither `to` nor configured recipients exist', async () => {
    const ctx = await harness({
      smtp: { host: 'smtp.qq.com', username: 'bot@qq.com', passwordRef: 'SMTP_AUTH_CODE' },
      recipients: [],
    })

    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: CallId('email-send-no-recipient'),
      name: EmailDigestPlugin.EMAIL_SEND_TOOL,
      arguments: { subject: 'S', body: 'B' },
    })
    expect(result.isError).toBe(true)
    expect(sendSmtpDigest).not.toHaveBeenCalled()
  })
})
