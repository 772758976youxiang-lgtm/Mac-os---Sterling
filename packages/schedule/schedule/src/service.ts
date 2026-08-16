/** Shared Schedule management service for model tools and host surfaces. */

import { Context, Service } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import {
  allocateScheduleId,
  createAfterScheduleRecord,
  createAtScheduleRecord,
  createEveryScheduleRecord,
  foldScheduleEvents,
  MIN_EVERY_INTERVAL_SECONDS,
  ScheduleInputError,
  ScheduleLogError,
  scheduleView,
} from './domain.ts'
import { flushSchedulePersistence } from './persistence.ts'
import { runScheduleTransaction } from './transaction.ts'
import type {
  InternalScheduleError,
  PersistenceUncertainError,
  ScheduleCreateValue,
  ScheduleDeleteValue,
  ScheduleId,
  ScheduleListValue,
  SchedulePersistenceOperation,
  ScheduleRecord,
  ScheduleRuleInput,
  ScheduleToolError,
  ScheduleUpdateValue,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    schedule: ScheduleService
  }
}

/** Stable fallback that does not expose implementation failures. */
function internalError(): InternalScheduleError {
  return { code: 'internal_error', message: 'The schedule operation failed.' }
}

/** Stable durable-log failure. */
function corruptLogError(): ScheduleToolError {
  return { code: 'corrupt_schedule_log', message: 'The session schedule log is corrupt.' }
}

/** Stable persistence uncertainty with the known operation identity. */
function persistenceError(
  operation: SchedulePersistenceOperation,
  id?: ScheduleId,
): PersistenceUncertainError {
  return {
    code: 'persistence_uncertain',
    message: 'Schedule persistence is uncertain; retry with schedule_list before relying on this result.',
    operation,
    ...id === undefined ? {} : { id },
  }
}

/** Translate one contained input failure to the public error union. */
function inputError(error: ScheduleInputError): ScheduleToolError {
  return { code: error.code, message: error.message }
}

/** Validate the selector constraints shared by tool and UI callers. */
export function validateScheduleRule(input: ScheduleRuleInput): ScheduleToolError | undefined {
  if (Number(input.afterSeconds !== undefined)
    + Number(input.at !== undefined)
    + Number(input.everySeconds !== undefined) !== 1) {
    return {
      code: 'invalid_selector',
      message: 'A schedule requires exactly one of afterSeconds, at, or everySeconds.',
    }
  }
  if (input.prompt.trim().length === 0) {
    return { code: 'invalid_prompt', message: 'prompt must be non-empty after trimming.' }
  }
  if (input.afterSeconds !== undefined
    && (!Number.isSafeInteger(input.afterSeconds) || input.afterSeconds <= 0)) {
    return { code: 'invalid_rule', message: 'afterSeconds must be a positive safe integer.' }
  }
  if (input.everySeconds !== undefined && !Number.isSafeInteger(input.everySeconds)) {
    return { code: 'invalid_rule', message: 'everySeconds must be a safe integer.' }
  }
  if (input.everySeconds !== undefined && input.everySeconds < MIN_EVERY_INTERVAL_SECONDS) {
    return {
      code: 'frequency_too_high',
      message: `everySeconds must be at least ${MIN_EVERY_INTERVAL_SECONDS}.`,
    }
  }
  return undefined
}

/** Build one validated durable record from a normalized rule. */
function createRecord(
  id: ScheduleId,
  input: ScheduleRuleInput,
): ScheduleRecord | ScheduleToolError {
  try {
    const now = Date.now()
    if (input.at !== undefined) return createAtScheduleRecord(id, input.prompt, input.at, now)
    if (input.afterSeconds !== undefined) {
      return createAfterScheduleRecord(id, input.prompt, input.afterSeconds, now)
    }
    return createEveryScheduleRecord(id, input.prompt, input.everySeconds as number, now)
  } catch (error: unknown) {
    return error instanceof ScheduleInputError ? inputError(error) : internalError()
  }
}

/** Whether a record construction returned an error. */
function isScheduleError(value: ScheduleRecord | ScheduleToolError): value is ScheduleToolError {
  return 'code' in value
}

/** Serialize one operation and stop a caller cancelled before its FIFO turn. */
function runManagedTransaction<T>(
  agent: Agent,
  signal: AbortSignal | undefined,
  operation: () => Promise<T>,
): Promise<T | InternalScheduleError> {
  return runScheduleTransaction<T | InternalScheduleError>(agent, () => signal?.aborted === true
    ? Promise.resolve(internalError())
    : operation())
}

/** Schedule service (`ctx.schedule`) over live root agents and their durable logs. */
export class ScheduleService extends Service {
  private readonly drives = new Map<Agent, () => void>()

  constructor(ctx: Context) {
    super(ctx, 'schedule')
  }

  /** Register one live root owner and its timer wake callback. */
  attach(agent: Agent, requestDrive: () => void): () => void {
    this.drives.set(agent, requestDrive)
    return () => {
      if (this.drives.get(agent) === requestDrive) this.drives.delete(agent)
    }
  }

  /** Return the live root owners whose Schedule runtime is active. */
  owners(): Agent[] {
    return [...this.drives.keys()]
  }

  /** Whether this exact agent is currently managed by Schedule. */
  owns(agent: Agent): boolean {
    return this.drives.has(agent)
  }

  /** List active reminders after a durability checkpoint. */
  list(agent: Agent, signal?: AbortSignal): Promise<ScheduleListValue> {
    return runManagedTransaction(agent, signal, async () => {
      const uncertain = await this.preflight(agent, 'list')
      if (uncertain !== undefined) return uncertain
      this.requestDrive(agent)
      const folded = this.fold(agent)
      if ('code' in folded) return folded
      const now = Date.now()
      return folded.active.map(record => scheduleView(record, now))
    })
  }

  /** Create one reminder and wake its runtime after persistence succeeds. */
  create(agent: Agent, input: ScheduleRuleInput, signal?: AbortSignal): Promise<ScheduleCreateValue> {
    const invalid = validateScheduleRule(input)
    if (invalid !== undefined) return Promise.resolve(invalid)
    return runManagedTransaction(agent, signal, async () => {
      const uncertain = await this.preflight(agent, 'create')
      if (uncertain !== undefined) return uncertain
      this.requestDrive(agent)
      const folded = this.fold(agent)
      if ('code' in folded) return folded
      const id = allocateScheduleId(folded)
      const record = createRecord(id, input)
      if (isScheduleError(record)) return record
      if (signal?.aborted === true) return internalError()
      try {
        agent.session.append('schedule/change', { version: 1, operation: 'create', schedule: record })
      } catch {
        return internalError()
      }
      const barrier = await this.preflight(agent, 'create', id)
      if (barrier !== undefined) return barrier
      this.requestDrive(agent)
      return scheduleView(record, Date.now())
    })
  }

  /** Replace one active reminder with a newly allocated durable record. */
  update(agent: Agent, id: ScheduleId, input: ScheduleRuleInput, signal?: AbortSignal): Promise<ScheduleUpdateValue> {
    const invalid = validateScheduleRule(input)
    if (invalid !== undefined) return Promise.resolve(invalid)
    return runManagedTransaction(agent, signal, async () => {
      const uncertain = await this.preflight(agent, 'delete', id)
      if (uncertain !== undefined) return uncertain
      this.requestDrive(agent)
      const folded = this.fold(agent)
      if ('code' in folded) return folded
      if (!folded.active.some(record => record.id === id)) {
        return { id, deleted: false, code: 'schedule_not_found' }
      }
      const nextId = allocateScheduleId(folded)
      const record = createRecord(nextId, input)
      if (isScheduleError(record)) return record
      if (signal?.aborted === true) return internalError()
      try {
        agent.session.append('schedule/change', { version: 1, operation: 'delete', id })
        agent.session.append('schedule/change', { version: 1, operation: 'create', schedule: record })
      } catch {
        return internalError()
      }
      const barrier = await this.preflight(agent, 'create', nextId)
      if (barrier !== undefined) return barrier
      this.requestDrive(agent)
      return scheduleView(record, Date.now())
    })
  }

  /** Delete one active reminder and wake its runtime after persistence succeeds. */
  delete(agent: Agent, id: ScheduleId, signal?: AbortSignal): Promise<ScheduleDeleteValue> {
    return runManagedTransaction(agent, signal, async () => {
      const uncertain = await this.preflight(agent, 'delete', id)
      if (uncertain !== undefined) return uncertain
      this.requestDrive(agent)
      const folded = this.fold(agent)
      if ('code' in folded) return folded
      if (!folded.active.some(record => record.id === id)) {
        return { id, deleted: false, code: 'schedule_not_found' }
      }
      if (signal?.aborted === true) return internalError()
      try {
        agent.session.append('schedule/change', { version: 1, operation: 'delete', id })
      } catch {
        return internalError()
      }
      const barrier = await this.preflight(agent, 'delete', id)
      if (barrier !== undefined) return barrier
      this.requestDrive(agent)
      return { id, deleted: true }
    })
  }

  /** Fold one exact owner's schedule suffix into active state. */
  private fold(agent: Agent): ReturnType<typeof foldScheduleEvents> | ScheduleToolError {
    try {
      return foldScheduleEvents(agent.session.events, agent.session.header.seedLength ?? 0)
    } catch (error: unknown) {
      return error instanceof ScheduleLogError ? corruptLogError() : internalError()
    }
  }

  /** Require one persistence checkpoint without exposing backend failures. */
  private async preflight(
    agent: Agent,
    operation: SchedulePersistenceOperation,
    id?: ScheduleId,
  ): Promise<PersistenceUncertainError | undefined> {
    try {
      await flushSchedulePersistence(this.ctx, agent.session)
      return undefined
    } catch {
      return persistenceError(operation, id)
    }
  }

  /** Wake one managed runtime while containing observer failures. */
  private requestDrive(agent: Agent): void {
    try {
      this.drives.get(agent)?.()
    } catch (error: unknown) {
      this.ctx.logger.warn(`schedule: durable-change observer failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
