/** Pure validation, folding, scheduling, and rendering for email digests. @module @deepseek-ai/dsh-email-digest */

import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { DigestFold, DigestItem, EmailDigestChange } from './types.ts'

/** Durable protocol version implemented by this package. */
export const EMAIL_DIGEST_CHANGE_VERSION = 1 as const

/** Thrown when a persisted digest event violates the version-1 protocol. */
export class EmailDigestLogError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EmailDigestLogError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const expected = new Set(keys)
  return Object.keys(value).every(key => expected.has(key)) && keys.every(key => key in value)
}

function nonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new EmailDigestLogError(`${field} must be a non-empty string`)
  }
  return value
}

function isoTimestamp(value: unknown, field: string): string {
  const text = nonEmptyString(value, field)
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(text) || !Number.isFinite(Date.parse(text))) {
    throw new EmailDigestLogError(`${field} must be an ISO UTC timestamp`)
  }
  return text
}

function decodeItem(value: unknown): DigestItem {
  if (!isRecord(value) || !(exactKeys(value, ['id', 'sessionId', 'prompt', 'response', 'collectedAt'])
    || exactKeys(value, ['id', 'sessionId', 'scheduleId', 'prompt', 'response', 'collectedAt']))) {
    throw new EmailDigestLogError('collect item has an invalid shape')
  }
  const scheduleId = value['scheduleId']
  if (scheduleId !== undefined && typeof scheduleId !== 'string') {
    throw new EmailDigestLogError('collect item scheduleId must be a string when present')
  }
  return Object.freeze({
    id: nonEmptyString(value['id'], 'item.id'),
    sessionId: nonEmptyString(value['sessionId'], 'item.sessionId') as DigestItem['sessionId'],
    ...(scheduleId === undefined ? {} : { scheduleId }),
    prompt: nonEmptyString(value['prompt'], 'item.prompt'),
    response: nonEmptyString(value['response'], 'item.response'),
    collectedAt: isoTimestamp(value['collectedAt'], 'item.collectedAt'),
  })
}

/** Decode one strict version-1 event payload. */
export function decodeEmailDigestChange(value: unknown): EmailDigestChange {
  if (!isRecord(value) || value['version'] !== EMAIL_DIGEST_CHANGE_VERSION
    || (value['operation'] !== 'collect' && value['operation'] !== 'deliver')) {
    throw new EmailDigestLogError('email-digest/change must be a version-1 collect or deliver event')
  }
  if (value['operation'] === 'collect') {
    if (!exactKeys(value, ['version', 'operation', 'item'])) {
      throw new EmailDigestLogError('collect event has unexpected fields')
    }
    return Object.freeze({ version: 1, operation: 'collect', item: decodeItem(value['item']) })
  }
  if (!exactKeys(value, ['version', 'operation', 'day', 'itemIds', 'deliveredAt'])
    || typeof value['itemIds'] !== 'object' || !Array.isArray(value['itemIds'])) {
    throw new EmailDigestLogError('deliver event has an invalid shape')
  }
  const itemIds = value['itemIds'].map(itemId => nonEmptyString(itemId, 'deliver.itemIds[]'))
  if (new Set(itemIds).size !== itemIds.length) throw new EmailDigestLogError('deliver itemIds must be unique')
  const day = nonEmptyString(value['day'], 'deliver.day')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    throw new EmailDigestLogError('deliver.day must be an ISO calendar date')
  }
  return Object.freeze({
    version: 1,
    operation: 'deliver',
    day,
    itemIds: Object.freeze(itemIds),
    deliveredAt: isoTimestamp(value['deliveredAt'], 'deliver.deliveredAt'),
  })
}

/** Fold the complete Session or only the post-seed suffix of a fork. */
export function foldEmailDigestEvents(events: readonly SessionEvent[], seedLength = 0): DigestFold {
  if (!Number.isSafeInteger(seedLength) || seedLength < 0 || seedLength > events.length) {
    throw new EmailDigestLogError('email digest seed length is invalid')
  }
  const items = new Map<string, DigestItem>()
  const delivered = new Set<string>()
  for (const event of events.slice(seedLength)) {
    if (event.type !== 'email-digest/change') continue
    const change = decodeEmailDigestChange(event.data)
    if (change.operation === 'collect') {
      if (items.has(change.item.id)) throw new EmailDigestLogError(`duplicate digest item ${change.item.id}`)
      items.set(change.item.id, change.item)
      continue
    }
    for (const itemId of change.itemIds) {
      if (!items.has(itemId)) throw new EmailDigestLogError(`delivery references unknown digest item ${itemId}`)
      delivered.add(itemId)
    }
  }
  return Object.freeze({ items: Object.freeze([...items.values()]), delivered })
}

/** Return items that have not yet been included in any successful delivery. */
export function pendingDigestItems(fold: DigestFold): DigestItem[] {
  return fold.items.filter(item => !fold.delivered.has(item.id))
}

/** Format a plain-text daily digest suitable for SMTP delivery. */
export function renderDigestText(items: readonly DigestItem[], day: string): string {
  const sections = items.map((item, index) => [
    `${String(index + 1)}. ${item.prompt}`,
    `Session: ${item.sessionId}`,
    ...(item.scheduleId === undefined ? [] : [`Schedule: ${item.scheduleId}`]),
    `Collected: ${item.collectedAt}`,
    '',
    item.response,
  ].join('\n'))
  return [`DeepSeek Harness daily digest - ${day}`, '', ...sections].join('\n\n')
}

/** Format a minimal escaped HTML digest suitable for HTML-capable mail clients. */
export function renderDigestHtml(items: readonly DigestItem[], day: string): string {
  const escape = (value: string): string => value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
  return `<h1>DeepSeek Harness daily digest - ${escape(day)}</h1>${items.map(item => (
    `<article><h2>${escape(item.prompt)}</h2><p><strong>Session:</strong> ${escape(item.sessionId)}`
    + (item.scheduleId === undefined ? '' : ` · <strong>Schedule:</strong> ${escape(item.scheduleId)}`)
    + `</p><p>${escape(item.response).replaceAll('\n', '<br>')}</p></article>`
  )).join('')}`
}
