/** Zod schemas for scheduled-task management RPCs. */

import { z } from 'zod'
import type { Wire } from './rpc.schema.ts'
import { sessionIdSchema } from './sessions.schema.ts'
import type {
  ScheduleActionError, ScheduleDeleteView, ScheduleMutationView, ScheduleRuleView, ScheduledTaskView,
} from './schedules.ts'

export const scheduleRuleSchema = z.object({
  prompt: z.string(),
  afterSeconds: z.number().int().optional(),
  at: z.string().optional(),
  everySeconds: z.number().int().optional(),
}).strict() satisfies z.ZodType<Wire<ScheduleRuleView>>

const commonTaskShape = {
  sessionId: sessionIdSchema,
  id: z.string(),
  prompt: z.string(),
  scheduledAt: z.string(),
  state: z.union([z.literal('scheduled'), z.literal('overdue')]),
  deliveryMode: z.literal('session-local'),
}

export const scheduledTaskSchema = z.discriminatedUnion('kind', [
  z.object({ ...commonTaskShape, kind: z.literal('after'), afterSeconds: z.number().int() }),
  z.object({ ...commonTaskShape, kind: z.literal('at') }),
  z.object({ ...commonTaskShape, kind: z.literal('every'), everySeconds: z.number().int() }),
]) satisfies z.ZodType<Wire<ScheduledTaskView>>

export const scheduleActionErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  operation: z.union([
    z.literal('create'), z.literal('list'), z.literal('update'), z.literal('delete'),
  ]).optional(),
  id: z.string().optional(),
}) satisfies z.ZodType<Wire<ScheduleActionError>>

export const scheduleListRequestSchema = z.object({}).strict()
export const scheduleListValueSchema = z.object({
  ownerSessionIds: z.array(sessionIdSchema),
  items: z.array(scheduledTaskSchema),
})

export const scheduleCreateRequestSchema = z.object({
  sessionId: sessionIdSchema,
  rule: scheduleRuleSchema,
})
export const scheduleUpdateRequestSchema = z.object({
  sessionId: sessionIdSchema,
  id: z.string().min(1),
  rule: scheduleRuleSchema,
})
export const scheduleDeleteRequestSchema = z.object({
  sessionId: sessionIdSchema,
  id: z.string().min(1),
})

export const scheduleMutationValueSchema = z.union([
  z.object({ ok: z.literal(true), task: scheduledTaskSchema }),
  z.object({ ok: z.literal(false), error: scheduleActionErrorSchema }),
]) satisfies z.ZodType<Wire<ScheduleMutationView>>

export const scheduleDeleteValueSchema = z.union([
  z.object({ ok: z.literal(true), deleted: z.literal(true) }),
  z.object({ ok: z.literal(false), error: scheduleActionErrorSchema }),
]) satisfies z.ZodType<Wire<ScheduleDeleteView>>
