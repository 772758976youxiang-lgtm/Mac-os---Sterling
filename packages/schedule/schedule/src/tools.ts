/**
 * Agent-scoped Schedule management tools over the durable session fold.
 * @module @deepseek-ai/dsh-schedule
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView } from '@deepseek-ai/dsh-tools'
import { MIN_EVERY_INTERVAL_SECONDS, ScheduleId } from './domain.ts'
import type { ScheduleService } from './service.ts'
import type {
  AtInput,
  ScheduleCreateValue,
  ScheduleDeleteValue,
  ScheduleListValue,
  ScheduleToolError,
} from './types.ts'

const SHARED_VIEW_PROPERTIES = {
  id: { type: 'string', required: true },
  prompt: { type: 'string', required: true },
  scheduledAt: { type: 'string', required: true },
  state: { type: 'string', required: true, enum: ['scheduled', 'overdue'] },
  deliveryMode: { type: 'string', required: true, const: 'session-local' },
} as const

const AFTER_VIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ...SHARED_VIEW_PROPERTIES,
    kind: { type: 'string', required: true, const: 'after' },
    afterSeconds: { type: 'integer', required: true },
  },
} as const

const AT_VIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ...SHARED_VIEW_PROPERTIES,
    kind: { type: 'string', required: true, const: 'at' },
  },
} as const

const EVERY_VIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ...SHARED_VIEW_PROPERTIES,
    kind: { type: 'string', required: true, const: 'every' },
    everySeconds: { type: 'integer', required: true },
  },
} as const

const VIEW_SCHEMA = { oneOf: [AFTER_VIEW_SCHEMA, AT_VIEW_SCHEMA, EVERY_VIEW_SCHEMA] } as const

/** Build one exact two-field error schema while preserving its literal code. */
function basicErrorSchema<const C extends string>(code: C) {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      code: { type: 'string', required: true, const: code },
      message: { type: 'string', required: true },
    },
  } as const
}

const BASIC_ERROR_SCHEMAS = [
  basicErrorSchema('invalid_prompt'),
  basicErrorSchema('invalid_selector'),
  basicErrorSchema('invalid_rule'),
  basicErrorSchema('invalid_time_zone'),
  basicErrorSchema('not_future'),
  basicErrorSchema('time_out_of_range'),
  basicErrorSchema('frequency_too_high'),
  basicErrorSchema('corrupt_schedule_log'),
  basicErrorSchema('internal_error'),
] as const

const PERSISTENCE_ERROR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    code: { type: 'string', required: true, const: 'persistence_uncertain' },
    message: { type: 'string', required: true },
    operation: { type: 'string', required: true, enum: ['create', 'list', 'delete'] },
    id: { type: 'string' },
  },
} as const

const ERROR_SCHEMAS = [
  ...BASIC_ERROR_SCHEMAS,
  PERSISTENCE_ERROR_SCHEMA,
] as const

const CREATE_OUTPUT_SCHEMA = { oneOf: [VIEW_SCHEMA, ...ERROR_SCHEMAS] } as const
const LIST_OUTPUT_SCHEMA = {
  oneOf: [
    { type: 'array', items: VIEW_SCHEMA },
    ...ERROR_SCHEMAS,
  ],
} as const
const DELETE_OUTPUT_SCHEMA = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        id: { type: 'string', required: true },
        deleted: { type: 'boolean', required: true, const: true },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        id: { type: 'string', required: true },
        deleted: { type: 'boolean', required: true, const: false },
        code: { type: 'string', required: true, const: 'schedule_not_found' },
      },
    },
    ...ERROR_SCHEMAS,
  ],
} as const

const CREATE_DESCRIPTION =
  'Create one reminder in the current session. Supply a non-empty prompt and exactly one selector: '
  + 'a positive safe-integer after_seconds delay, at as a strict offset date-time or local '
  + `date/time object, or safe-integer every_seconds of at least ${MIN_EVERY_INTERVAL_SECONDS}. `
  + 'Fixed-rate reminders stay creation-aligned, skip missed occurrences, and batch one latest '
  + 'occurrence per overdue rule. '
  + 'Delivery is session-local: the reminder runs on time only while this session '
  + 'is live and otherwise becomes overdue until the session is resumed.'

const LIST_DESCRIPTION =
  'List every active reminder in the current session in creation order, including its exact id, '
  + 'UTC target, scheduled or overdue state, and session-local delivery mode.'

const DELETE_DESCRIPTION =
  'Delete one active reminder in the current session by the exact id returned by schedule_create '
  + 'or schedule_list. Unknown or already-finished ids return deleted false.'

/** Deterministic model content for every canonical Schedule value. */
function renderValue(_args: unknown, value: unknown): ContentBlock[] {
  // The ToolRuntime has already validated the value against the lossless-JSON output schema.
  const text = JSON.stringify(value)
  return [{ type: 'text', text }]
}

/** Pure generic pending card. */
function present(title: string, kind: 'read' | 'other', rawInput?: unknown): GenericCallView {
  return { card: 'generic', title, kind, ...rawInput === undefined ? {} : { rawInput } }
}

/** Validate the v1 selector constraints that the open parameter root cannot express. */
function validateCreateArgs(args: {
  prompt: string
  after_seconds?: number
  at?: AtInput
  every_seconds?: number
}): ScheduleToolError | undefined {
  const keys = Object.keys(args as unknown as Record<string, unknown>)
  if (keys.some(key => key !== 'prompt'
    && key !== 'after_seconds'
    && key !== 'at'
    && key !== 'every_seconds')
    || Number(args.after_seconds !== undefined)
    + Number(args.at !== undefined)
    + Number(args.every_seconds !== undefined) !== 1) {
    return {
      code: 'invalid_selector',
      message: 'schedule_create accepts exactly one of after_seconds, at, or every_seconds.',
    }
  }
  if (args.prompt.trim().length === 0) {
    return { code: 'invalid_prompt', message: 'prompt must be non-empty after trimming.' }
  }
  if (args.after_seconds !== undefined
    && (!Number.isSafeInteger(args.after_seconds) || args.after_seconds <= 0)) {
    return { code: 'invalid_rule', message: 'after_seconds must be a positive safe integer.' }
  }
  if (args.every_seconds !== undefined && !Number.isSafeInteger(args.every_seconds)) {
    return { code: 'invalid_rule', message: 'every_seconds must be a safe integer.' }
  }
  if (args.every_seconds !== undefined && args.every_seconds < MIN_EVERY_INTERVAL_SECONDS) {
    return {
      code: 'frequency_too_high',
      message: `every_seconds must be at least ${MIN_EVERY_INTERVAL_SECONDS}.`,
    }
  }
  return undefined
}

/**
 * Register all three Schedule tools in one exact agent scope.
 * @param rootCtx - Global service context owning sessions and durability.
 * @param toolCtx - Exact agent-scoped context receiving the definitions.
 * @param agent - Exact live owner whose session the tools mutate.
 * @param schedule - Shared Schedule management service.
 * @returns Idempotent aggregate disposer for the three registrations.
 */
export function registerScheduleTools(
  _rootCtx: Context,
  toolCtx: Context,
  agent: Agent,
  schedule: ScheduleService,
): () => void {
  const disposers: Array<() => void> = []

  try {
    disposers.push(toolCtx.tools.register(defineTool({
      name: 'schedule_create',
      description: CREATE_DESCRIPTION,
      parameters: {
        prompt: {
          type: 'string',
          required: true,
          description: 'Reminder content to present when the target becomes due.',
        },
        after_seconds: {
          type: 'number',
          description: 'Positive safe-integer delay in seconds.',
        },
        every_seconds: {
          type: 'number',
          description: `Fixed-rate safe-integer interval in seconds, at least ${MIN_EVERY_INTERVAL_SECONDS}.`,
        },
        at: {
          description: 'Absolute target as strict offset RFC 3339 or local date/time with an explicit IANA zone.',
          oneOf: [
            { type: 'string' },
            {
              type: 'object',
              additionalProperties: false,
              properties: {
                date: { type: 'string', required: true },
                time: { type: 'string', required: true },
                time_zone: { type: 'string', required: true },
              },
            },
          ],
        },
      },
      output: { schema: CREATE_OUTPUT_SCHEMA, render: renderValue },
      async execute(args, exec): Promise<ScheduleCreateValue> {
        if (exec.agent !== agent) return { code: 'internal_error', message: 'The schedule operation failed.' }
        const invalid = validateCreateArgs(args)
        if (invalid !== undefined) return invalid
        return schedule.create(agent, {
          prompt: args.prompt,
          ...args.at === undefined ? {} : { at: args.at },
          ...args.after_seconds === undefined ? {} : { afterSeconds: args.after_seconds },
          ...args.every_seconds === undefined ? {} : { everySeconds: args.every_seconds },
        }, exec.signal)
      },
      presentCall: args => present('Create reminder', 'other', args.prompt),
    })))

    disposers.push(toolCtx.tools.register(defineTool({
      name: 'schedule_list',
      description: LIST_DESCRIPTION,
      parameters: {},
      output: { schema: LIST_OUTPUT_SCHEMA, render: renderValue },
      async execute(_args, exec): Promise<ScheduleListValue> {
        if (exec.agent !== agent) return { code: 'internal_error', message: 'The schedule operation failed.' }
        return schedule.list(agent, exec.signal)
      },
      presentCall: () => present('List reminders', 'read'),
    })))

    disposers.push(toolCtx.tools.register(defineTool({
      name: 'schedule_delete',
      description: DELETE_DESCRIPTION,
      parameters: {
        id: { type: 'string', required: true, description: 'Exact session-local schedule id.' },
      },
      output: { schema: DELETE_OUTPUT_SCHEMA, render: renderValue },
      async execute(args, exec): Promise<ScheduleDeleteValue> {
        if (args.id.length === 0 || args.id.trim() !== args.id) {
          return { code: 'invalid_rule', message: 'schedule_delete id must be non-empty without surrounding whitespace.' }
        }
        const id = ScheduleId(args.id)
        if (exec.agent !== agent) return { code: 'internal_error', message: 'The schedule operation failed.' }
        return schedule.delete(agent, id, exec.signal)
      },
      presentCall: args => present('Delete reminder', 'other', args.id),
    })))
  } catch (error) {
    for (const dispose of disposers.reverse()) dispose()
    throw error
  }

  let active = true
  return () => {
    if (!active) return
    active = false
    for (const dispose of disposers.reverse()) dispose()
  }
}
