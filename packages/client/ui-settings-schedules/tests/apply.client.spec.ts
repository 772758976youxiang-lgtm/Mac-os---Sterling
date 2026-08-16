/** Settings registration, ordering, localization, and reset refresh. */

import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-settings-schedules/client'
import { SchedulesSection } from '../src/client/SchedulesSection.tsx'
import type { SchedulesSectionInjected } from '../src/client/SchedulesSection.tsx'

usePinnedBrowserLanguages('zh-CN')

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  ctx.provide('connection', { api: { schedules: {} } } as never)
  const slots = ctx.get('slots') as SlotRegistry
  slots.register({ name: 'root', children: { 'settings.section': { kind: 'list', scope: 'root' } } } as never, () => null)
  await ctx.plugin({ inject: [...inject], apply }).await()
  return { ctx, locale, slots }
}

describe('ui-settings-schedules apply', () => {
  it('registers between Models and Plugins with locale-following copy', async () => {
    const { locale, slots } = await bench()
    const entry = slots.entries('settings.section')[0]!

    expect(entry.component).toBe(SchedulesSection)
    expect(entry.options).toMatchObject({ id: 'schedules', order: 12 })
    expect(resolveSlotLabel(entry.options.label)).toBe('定时任务')
    const injected = (entry.inject as unknown as () => SchedulesSectionInjected)()
    expect(injected.t('create')).toBe('新建任务')
    expect(typeof injected.controller.load).toBe('function')

    locale.setLocale('en')
    expect(resolveSlotLabel(entry.options.label)).toBe('Scheduled tasks')
  })

  it('refreshes an already loaded page after reconnect', async () => {
    const { ctx, slots } = await bench()
    const injected = (slots.entries('settings.section')[0]!.inject as unknown as () => SchedulesSectionInjected)()
    injected.controller.store.update((state) => { state.status = 'ready' })
    const load = vi.spyOn(injected.controller, 'load').mockResolvedValue()

    ctx.emit('connection/reset')
    await Promise.resolve()

    expect(load).toHaveBeenCalledOnce()
  })
})
