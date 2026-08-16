/** Scheduled-task management contract for live root sessions. */

import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { RpcRequest, RpcResponse } from './rpc.ts'

/** Browser-facing rule input. Exactly one timing selector must be present. */
export interface ScheduleRuleView {
  prompt: string
  afterSeconds?: number
  at?: string
  everySeconds?: number
}

/** One active scheduled task with its owning session identity. */
export type ScheduledTaskView = {
  sessionId: SessionId
  id: string
  prompt: string
  scheduledAt: string
  state: 'scheduled' | 'overdue'
  deliveryMode: 'session-local'
} & (
  | { kind: 'after'; afterSeconds: number }
  | { kind: 'at' }
  | { kind: 'every'; everySeconds: number }
)

/** Stable Schedule-domain rejection returned without marking transport unhealthy. */
export interface ScheduleActionError {
  code: string
  message: string
  operation?: 'create' | 'list' | 'update' | 'delete'
  id?: string
}

/** Result of a create or update request. */
export type ScheduleMutationView =
  | { ok: true; task: ScheduledTaskView }
  | { ok: false; error: ScheduleActionError }

/** Result of a delete request. */
export type ScheduleDeleteView =
  | { ok: true; deleted: true }
  | { ok: false; error: ScheduleActionError }

/** Scheduled-task API exposed to the settings client. */
export interface SchedulesApi {
  /** List active tasks and the live sessions eligible to own a new task. */
  list(request: RpcRequest<Record<string, never>>): Promise<RpcResponse<{
    ownerSessionIds: SessionId[]
    items: ScheduledTaskView[]
  }>>
  /** Create a task in one live or resumable root session. */
  create(request: RpcRequest<{ sessionId: SessionId; rule: ScheduleRuleView }>): Promise<RpcResponse<ScheduleMutationView>>
  /** Replace one active task in its owning session. */
  update(request: RpcRequest<{ sessionId: SessionId; id: string; rule: ScheduleRuleView }>): Promise<RpcResponse<ScheduleMutationView>>
  /** Delete one active task from its owning session. */
  delete(request: RpcRequest<{ sessionId: SessionId; id: string }>): Promise<RpcResponse<ScheduleDeleteView>>
}
