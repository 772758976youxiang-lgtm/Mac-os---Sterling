/** Package-owned durable email digest invariants. @module @deepseek-ai/dsh-email-digest/invariant */

import type { Context } from '@deepseek-ai/cordis'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type { InvariantFailure, InvariantInstaller } from '@deepseek-ai/dsh-invariants'
import { EmailDigestLogError, foldEmailDigestEvents } from './domain.ts'

const PACKAGE_NAME = '@deepseek-ai/dsh-email-digest'

/** Cordis invariant companion name. */
export const name = 'email-digest-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

function validate(events: readonly SessionEvent[], seedLength: number, fail: InvariantFailure): void {
  try {
    foldEmailDigestEvents(events, seedLength)
  } catch (error: unknown) {
    /* v8 ignore next -- the strict decoder normalizes malformed entries. */
    if (!(error instanceof EmailDigestLogError)) throw error
    fail(error.message)
  }
}

/** Validate replayed and pre-append email digest entries under fork suffix policy. */
const install: InvariantInstaller = Object.assign((ctx: Context, fail: InvariantFailure) => {
  for (const session of ctx.sessions.list()) {
    validate(session.events, session.header.seedLength ?? 0, fail)
  }
  ctx.on('session/created', (session) => {
    validate(session.events, session.header.seedLength ?? 0, fail)
  }, { global: true })
  ctx.on('internal/dispatch', (_mode, eventName, args) => {
    if (eventName !== 'session/event') return
    const [session, event] = args as [Session, SessionEvent]
    if (event.type !== 'email-digest/change') return
    validate([...session.events, event], session.header.seedLength ?? 0, fail)
  }, { global: true })
}, { inject: ['sessions'] })

/** Register the package-owned durable event invariant. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
