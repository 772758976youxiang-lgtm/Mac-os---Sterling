/** Scheduled-task page state over the typed Schedule RPC domain. */

import type {
  IApiClient, ScheduleRuleView, ScheduledTaskView,
} from '@deepseek-ai/dsh-api-remotes/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'

/** Page snapshot rendered by the settings section. */
export interface SchedulesState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  ownerSessionIds: readonly string[]
  items: readonly ScheduledTaskView[]
  busy: boolean
}

/** Scheduled-task page controller. */
export class SchedulesStore {
  readonly store: SnapshotStore<SchedulesState> = createSnapshotStore<SchedulesState>({
    status: 'idle', error: null, ownerSessionIds: [], items: [], busy: false,
  })

  private generation = 0

  constructor(private readonly api: Pick<IApiClient, 'schedules'>) {}

  /** Refresh the complete directory; latest load wins. */
  async load(): Promise<void> {
    const generation = ++this.generation
    this.store.update((state) => { state.status = 'loading'; state.error = null })
    try {
      const response = await this.api.schedules.list({})
      if (!response.result.ok) throw new Error(response.result.error.message)
      if (generation !== this.generation) return
      const value = response.result.value
      this.store.update((state) => {
        state.status = 'ready'
        state.error = null
        state.ownerSessionIds = value.ownerSessionIds
        state.items = value.items
      })
    } catch (error: unknown) {
      if (generation !== this.generation) return
      this.store.update((state) => {
        state.status = 'error'
        state.error = error instanceof Error ? error.message : String(error)
      })
    }
  }

  /** Create one task and refresh the directory after the write. */
  async create(sessionId: string, rule: ScheduleRuleView): Promise<string | undefined> {
    return this.mutate(() => this.api.schedules.create({ sessionId: sessionId as never, rule }))
  }

  /** Replace one task and refresh the directory after the write. */
  async update(task: ScheduledTaskView, rule: ScheduleRuleView): Promise<string | undefined> {
    return this.mutate(() => this.api.schedules.update({ sessionId: task.sessionId, id: task.id, rule }))
  }

  /** Delete one task and refresh the directory after the write. */
  async delete(task: ScheduledTaskView): Promise<string | undefined> {
    this.store.update((state) => { state.busy = true })
    try {
      const response = await this.api.schedules.delete({ sessionId: task.sessionId, id: task.id })
      if (!response.result.ok) return response.result.error.message
      if (!response.result.value.ok) return response.result.value.error.message
      await this.load()
      return undefined
    } catch (error: unknown) {
      return error instanceof Error ? error.message : String(error)
    } finally {
      this.store.update((state) => { state.busy = false })
    }
  }

  /** Run a create/update mutation and refresh on success. */
  private async mutate(
    operation: () => ReturnType<IApiClient['schedules']['create']>,
  ): Promise<string | undefined> {
    this.store.update((state) => { state.busy = true })
    try {
      const response = await operation()
      if (!response.result.ok) return response.result.error.message
      if (!response.result.value.ok) return response.result.value.error.message
      await this.load()
      return undefined
    } catch (error: unknown) {
      return error instanceof Error ? error.message : String(error)
    } finally {
      this.store.update((state) => { state.busy = false })
    }
  }
}
