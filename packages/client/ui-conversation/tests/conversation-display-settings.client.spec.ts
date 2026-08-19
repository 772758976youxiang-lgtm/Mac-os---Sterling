// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import { ConversationDisplaySettings } from '../src/client/settings/conversation-display-settings.ts'
import type { ConversationSettings } from '../src/submission-settings.ts'

describe('ConversationDisplaySettings', () => {
  it('defaults to visible and persists an explicit change', () => {
    const host = stubSettingsScope<ConversationSettings>()
    const settings = new ConversationDisplaySettings(host.scope)
    expect(settings.showContextInjections.getSnapshot()).toBe(true)
    expect(settings.showToolCalls.getSnapshot()).toBe(true)
    expect(settings.showThinking.getSnapshot()).toBe(true)

    settings.setShowContextInjections(false)
    expect(settings.showContextInjections.getSnapshot()).toBe(false)
    expect(host.set).toHaveBeenCalledWith('showContextInjections', false)

    settings.setShowToolCalls(false)
    expect(settings.showToolCalls.getSnapshot()).toBe(false)
    expect(host.set).toHaveBeenCalledWith('showToolCalls', false)

    settings.setShowThinking(false)
    expect(settings.showThinking.getSnapshot()).toBe(false)
    expect(host.set).toHaveBeenCalledWith('showThinking', false)
  })

  it('adopts Host changes without writing them back', () => {
    const host = stubSettingsScope<ConversationSettings>()
    const settings = new ConversationDisplaySettings(host.scope)
    host.publish({
      status: 'ready', value: { busyEnter: 'queue', showContextInjections: false, showToolCalls: false, showThinking: false }, revision: 1, writable: true,
    })
    expect(settings.showContextInjections.getSnapshot()).toBe(false)
    expect(settings.showToolCalls.getSnapshot()).toBe(false)
    expect(settings.showThinking.getSnapshot()).toBe(false)
    expect(host.set).not.toHaveBeenCalled()
  })
})
