/** Scheduled-task settings plugin, browser half. */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { SchedulesSection } from './SchedulesSection.tsx'
import type { SchedulesSectionInjected } from './SchedulesSection.tsx'
import { SchedulesStore } from './store.ts'
import { en, zh, type SchedulesKey } from './locales.ts'

export type { SchedulesSectionInjected, SchedulesSectionProps } from './SchedulesSection.tsx'
export type { SchedulesState } from './store.ts'
export { SchedulesStore } from './store.ts'
export type { SchedulesKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Scheduled-task settings copy. */
    'settings.schedules': SchedulesKey
  }
}

const NS = 'settings.schedules'

/** Required browser services. */
export const inject = ['slots', 'locale', 'connection']

/** Register the scheduled-task page between Models and Plugins. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-schedules: dictionaries')
  const connection = ctx.get('connection') as ConnectionHandle
  const controller = new SchedulesStore(connection.api)
  const useSnapshot = bindSnapshotSelector(controller.store)
  const t = ctx.locale.bind(NS) as SchedulesSectionInjected['t']

  ctx.effect(() => ctx.on('connection/reset', () => {
    if (controller.store.getSnapshot().status !== 'idle') void controller.load()
  }), 'ui-settings-schedules: connection refresh')

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'schedules',
    order: 12,
    label: () => t('nav'),
    locale: NS,
    inject: (): SchedulesSectionInjected => ({ controller, useSnapshot, api: connection.api, t }),
  }, SchedulesSection))
}
