import { describe, expect, it, vi } from 'vitest'
import { VisionSettingsController } from '../src/client/vision-card-controller.ts'
import type { VisionSettingsState } from '../src/client/vision-card-controller.ts'

function scope() {
  let snapshot = {
    status: 'ready' as const,
    value: {
      visionApiKeyEnv: 'DASHSCOPE_API_KEY',
      visionBaseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      visionModel: 'qwen3.7-flash',
    },
    base: {}, user: {}, revision: 0, writable: true, mode: 'host' as const,
  }
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    set: vi.fn(async (field: string, value: unknown) => {
      snapshot = { ...snapshot, value: { ...snapshot.value, [field]: value }, revision: snapshot.revision + 1 }
      for (const listener of listeners) listener()
    }),
  }
}

describe('vision plugin settings controller', () => {
  it('writes the API key only through credentials and keeps the draft write-only', async () => {
    const settings = scope()
    const credentials = {
      describe: vi.fn().mockResolvedValue({ result: { ok: true, value: {
        credentials: { DASHSCOPE_API_KEY: { configured: false, writable: true } },
      } } }),
      set: vi.fn().mockResolvedValue({ result: { ok: true, value: {} } }),
    }
    const controller = new VisionSettingsController(settings as never, { credentials } as never)
    const face = controller.inject()
    await vi.waitFor(() => { expect(credentials.describe).toHaveBeenCalled() })

    face.edit('apiKey', 'qwen-secret')
    expect(face.hooks.visionSettings.getSnapshot().apiKeyDraft).toBe('qwen-secret')
    face.save()
    await vi.waitFor(() => { expect(credentials.set).toHaveBeenCalledWith({ ref: 'DASHSCOPE_API_KEY', value: 'qwen-secret' }) })
    expect(settings.set).not.toHaveBeenCalledWith('visionApiKey', expect.anything())
  })

  it('stages a custom credential reference before saving', async () => {
    const settings = scope()
    const credentials = {
      describe: vi.fn().mockResolvedValue({ result: { ok: true, value: {
        credentials: { QWEN_API_KEY: { configured: true, writable: true } },
      } } }),
      set: vi.fn().mockResolvedValue({ result: { ok: true, value: {} } }),
    }
    const controller = new VisionSettingsController(settings as never, { credentials } as never)
    const face = controller.inject()
    face.edit('apiKeyRef', 'QWEN_API_KEY')
    face.edit('apiKey', 'new-key')
    face.save()
    await vi.waitFor(() => { expect(settings.set).toHaveBeenCalledWith('visionApiKeyEnv', 'QWEN_API_KEY') })
    await vi.waitFor(() => { expect(credentials.set).toHaveBeenCalledWith({ ref: 'QWEN_API_KEY', value: 'new-key' }) })
    const state = face.hooks.visionSettings.getSnapshot() as VisionSettingsState
    expect(state.apiKeyRef).toBe('QWEN_API_KEY')
  })
})
