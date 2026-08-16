/** Scheduled-task store: load projection plus write-and-refresh behavior. */

import { describe, expect, it, vi } from 'vitest'
import type { RpcResponse, ScheduledTaskView } from '@deepseek-ai/dsh-api-remotes/client'
import { SchedulesStore } from '../src/client/store.ts'

let nextRpc = 0
function ok<T>(value: T): RpcResponse<T> {
  return { rpcId: `schedule-${nextRpc++}` as never, result: { ok: true, value } }
}

function transportFailure<T>(message: string): RpcResponse<T> {
  return {
    rpcId: `schedule-${nextRpc++}` as never,
    result: { ok: false, error: { code: 'internal', message, details: {} } },
  }
}

const TASK: ScheduledTaskView = {
  sessionId: 'session-a' as never,
  id: 'schedule-a',
  prompt: 'Review open work',
  scheduledAt: '2026-08-17T01:00:00.000Z',
  state: 'scheduled',
  deliveryMode: 'session-local',
  kind: 'every',
  everySeconds: 3_600,
}

function api() {
  let items: ScheduledTaskView[] = [TASK]
  const schedules = {
    list: vi.fn(() => Promise.resolve(ok({ ownerSessionIds: ['session-a' as never], items }))),
    create: vi.fn(() => Promise.resolve(ok({ ok: true as const, task: TASK }))),
    update: vi.fn(() => Promise.resolve(ok({ ok: true as const, task: TASK }))),
    delete: vi.fn(() => {
      items = []
      return Promise.resolve(ok({ ok: true as const, deleted: true as const }))
    }),
  }
  return schedules
}

describe('SchedulesStore', () => {
  it('loads owners and active tasks', async () => {
    const schedules = api()
    const controller = new SchedulesStore({ schedules })

    await controller.load()

    expect(controller.store.getSnapshot()).toMatchObject({
      status: 'ready', error: null, ownerSessionIds: ['session-a'], items: [TASK],
    })
  })

  it('surfaces transport failures without throwing', async () => {
    const controller = new SchedulesStore({
      schedules: { ...api(), list: () => Promise.resolve(transportFailure('host unavailable')) },
    })

    await controller.load()

    expect(controller.store.getSnapshot()).toMatchObject({ status: 'error', error: 'host unavailable' })
  })

  it('returns domain failures and clears the busy state', async () => {
    const schedules = api()
    schedules.create.mockResolvedValueOnce(ok({
      ok: false as const,
      error: { code: 'invalid_rule', message: 'Choose one timing rule.' },
    }) as never)
    const controller = new SchedulesStore({ schedules })

    await expect(controller.create('session-a', { prompt: 'work', everySeconds: 300 }))
      .resolves.toBe('Choose one timing rule.')
    expect(controller.store.getSnapshot().busy).toBe(false)
  })

  it('refreshes after create, update, and delete', async () => {
    const schedules = api()
    const controller = new SchedulesStore({ schedules })

    await controller.create('session-a', { prompt: 'create', everySeconds: 300 })
    await controller.update(TASK, { prompt: 'update', at: '2026-08-18T00:00:00.000Z' })
    await controller.delete(TASK)

    expect(schedules.create).toHaveBeenCalledOnce()
    expect(schedules.update).toHaveBeenCalledOnce()
    expect(schedules.delete).toHaveBeenCalledOnce()
    expect(schedules.list).toHaveBeenCalledTimes(3)
    expect(controller.store.getSnapshot()).toMatchObject({ status: 'ready', items: [], busy: false })
  })
})
