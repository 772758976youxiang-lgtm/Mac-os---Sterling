/** Memory-system settings plugin, browser half. */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { MemorySection } from './MemorySection.tsx'
import type { MemorySectionInjected } from './MemorySection.tsx'
import { createApi } from './store.ts'
import { en, zh, type MemoryKey } from './locales.ts'

export type { MemorySectionInjected, MemorySectionProps } from './MemorySection.tsx'
export type { MemoryMeta, MemoryDoc, SkillMeta, SkillDoc, SearchHit, LoopEvent, ProviderView } from './store.ts'
export type { MemoryKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Memory-system settings copy. */
    'settings.memory': MemoryKey
  }
}

const NS = 'settings.memory'

/** Required browser services. */
export const inject = ['slots', 'locale']

/** Register the memory-system page between Plugins and Agent presets. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-memory: dictionaries')
  const api = createApi()
  const t = ctx.locale.bind(NS) as MemorySectionInjected['t']

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'memory',
    order: 17,
    label: () => t('nav'),
    locale: NS,
    inject: (): MemorySectionInjected => ({ api, t }),
  }, MemorySection))
}
