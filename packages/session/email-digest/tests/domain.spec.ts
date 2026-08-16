import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import {
  EmailDigestLogError,
  foldEmailDigestEvents,
  pendingDigestItems,
  renderDigestHtml,
} from '../src/domain.ts'

function event(data: unknown): SessionEvent {
  return {
    type: 'email-digest/change',
    seq: 1,
    time: '2026-08-16T10:00:00.000Z',
    data,
  } as SessionEvent
}

describe('email digest durable protocol', () => {
  it('keeps collected items pending until a successful delivery marker names them', () => {
    const collected = event({
      version: 1,
      operation: 'collect',
      item: {
        id: 'digest-1',
        sessionId: 'session-1',
        prompt: 'check the report',
        response: 'The report is ready.',
        collectedAt: '2026-08-16T10:00:00.000Z',
      },
    })
    const delivery = event({
      version: 1,
      operation: 'deliver',
      day: '2026-08-16',
      itemIds: ['digest-1'],
      deliveredAt: '2026-08-16T18:00:00.000Z',
    })

    expect(pendingDigestItems(foldEmailDigestEvents([collected]))).toHaveLength(1)
    expect(pendingDigestItems(foldEmailDigestEvents([collected, delivery]))).toEqual([])
  })

  it('rejects delivery markers that claim an item which was never collected', () => {
    expect(() => foldEmailDigestEvents([event({
      version: 1,
      operation: 'deliver',
      day: '2026-08-16',
      itemIds: ['unknown'],
      deliveredAt: '2026-08-16T18:00:00.000Z',
    })])).toThrow(EmailDigestLogError)
  })

  it('escapes collected text before embedding it in HTML mail', () => {
    expect(renderDigestHtml([{
      id: 'digest-1',
      sessionId: 'session-1' as never,
      prompt: '<unsafe>',
      response: 'Tom & Jerry',
      collectedAt: '2026-08-16T10:00:00.000Z',
    }], '2026-08-16')).toContain('&lt;unsafe&gt;')
    expect(renderDigestHtml([{
      id: 'digest-1',
      sessionId: 'session-1' as never,
      prompt: '<unsafe>',
      response: 'Tom & Jerry',
      collectedAt: '2026-08-16T10:00:00.000Z',
    }], '2026-08-16')).toContain('Tom &amp; Jerry')
  })
})
