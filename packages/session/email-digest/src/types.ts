/** Durable daily email digest values. @module @deepseek-ai/dsh-email-digest */

import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** One completed scheduled response retained for the next digest. */
export interface DigestItem {
  /** Stable identity derived from the owning Session and assistant event sequence. */
  readonly id: string
  /** The owning Session, included for cross-session digest rendering. */
  readonly sessionId: SessionId
  /** Schedule identity when the reminder framing exposed one. */
  readonly scheduleId?: string
  /** Original reminder text. */
  readonly prompt: string
  /** Assistant response text collected after the reminder. */
  readonly response: string
  /** ISO timestamp at which the response was collected. */
  readonly collectedAt: string
}

/** Versioned durable append-only digest mutation. */
export type EmailDigestChange =
  | {
    readonly version: 1
    readonly operation: 'collect'
    readonly item: DigestItem
  }
  | {
    readonly version: 1
    readonly operation: 'deliver'
    readonly day: string
    readonly itemIds: readonly string[]
    readonly deliveredAt: string
  }

/** Folded Session-local digest state. */
export interface DigestFold {
  readonly items: readonly DigestItem[]
  readonly delivered: ReadonlySet<string>
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Durable result collection and daily delivery markers. */
    'email-digest/change': EmailDigestChange
  }
}
