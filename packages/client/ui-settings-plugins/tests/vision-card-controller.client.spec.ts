import { describe, expect, it, vi } from 'vitest'
import { VisionSettingsController } from '../src/client/vision-card-controller.ts'

function scope(value: {
  visionProvider?: string
  visionDisplayName?: string
  visionBaseURL?: string
  visionApi?: string
  visionApiKeyEnv?: string
  visionModel?: string
} = {}) {
  let snapshot = {
    status: 'ready' as const,
    value,
    base: {}, user: {}, revision: 0, writable: true, mode: 'host' as const,
  }
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    set: vi.fn(async (field: string, next: unknown) => {
      snapshot = { ...snapshot, value: { ...snapshot.value, [field]: next }, revision: snapshot.revision + 1 }
      for (const listener of listeners) listener()
    }),
  }
}

function credentials() {
  return {
    describe: vi.fn().mockResolvedValue({ result: { ok: true, value: { credentials: {} } } }),
    set: vi.fn().mockResolvedValue({ result: { ok: true, value: { ref: 'ACME_GATEWAY_API_KEY' } } }),
  }
}

describe('vision plugin custom provider controller', () => {
  it('stages and saves a custom provider with its API key', async () => {
    const settings = scope()
    const secret = credentials()
    const controller = new VisionSettingsController(settings as never, { credentials: secret } as never)
    const face = controller.inject()

    face.edit('provider', 'acme-gateway')
    face.edit('displayName', 'Acme Gateway')
    face.edit('baseURL', 'https://gateway.example/v1')
    face.edit('model', 'acme-vision')
    face.edit('apiKey', 'secret-key')

    expect(face.hooks.visionSettings.getSnapshot()).toMatchObject({
      provider: 'acme-gateway', baseURL: 'https://gateway.example/v1', model: 'acme-vision',
      dirty: true, invalid: false,
    })

    face.save()
    await vi.waitFor(() => { expect(settings.set).toHaveBeenCalledWith('visionProvider', 'acme-gateway') })
    await vi.waitFor(() => { expect(secret.set).toHaveBeenCalledWith({ ref: 'ACME_GATEWAY_API_KEY', value: 'secret-key' }) })
    await vi.waitFor(() => { expect(face.hooks.visionSettings.getSnapshot().dirty).toBe(false) })
    expect(settings.set).toHaveBeenCalledWith('visionDisplayName', 'Acme Gateway')
    expect(settings.set).toHaveBeenCalledWith('visionBaseURL', 'https://gateway.example/v1')
    expect(settings.set).toHaveBeenCalledWith('visionModel', 'acme-vision')
  })

  it('accepts a host-style endpoint and normalizes it before saving', async () => {
    const settings = scope()
    const controller = new VisionSettingsController(settings as never, { credentials: credentials() } as never)
    const face = controller.inject()

    face.edit('provider', 'acme-gateway')
    face.edit('baseURL', 'www.sdasd')
    face.edit('model', 'acme-vision')

    expect(face.hooks.visionSettings.getSnapshot()).toMatchObject({ dirty: true, invalid: false })

    face.save()
    await vi.waitFor(() => { expect(settings.set).toHaveBeenCalledWith('visionBaseURL', 'https://www.sdasd') })
  })

  it('blocks incomplete custom provider data', () => {
    const controller = new VisionSettingsController(scope() as never, { credentials: credentials() } as never)
    const face = controller.inject()

    face.edit('provider', 'Acme Gateway')
    face.edit('baseURL', 'https://')
    face.edit('model', 'vision')

    expect(face.hooks.visionSettings.getSnapshot()).toMatchObject({ dirty: true, invalid: true })
  })

  it('does not surface a legacy model without a custom provider', () => {
    const controller = new VisionSettingsController(
      scope({ visionModel: 'qwen3.7-flash' }) as never,
      { credentials: credentials() } as never,
    )
    expect(controller.inject().hooks.visionSettings.getSnapshot()).toMatchObject({ provider: '', model: '' })
  })
})
