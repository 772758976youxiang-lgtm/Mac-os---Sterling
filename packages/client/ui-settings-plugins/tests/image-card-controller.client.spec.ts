import { describe, expect, it, vi } from 'vitest'
import { ImageSettingsController } from '../src/client/image-card-controller.ts'

function scope(value: {
  provider?: string
  model?: string
  imageProvider?: string
  imageDisplayName?: string
  imageBaseURL?: string
  imageApi?: string
  imageApiKeyEnv?: string
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
    set: vi.fn().mockResolvedValue({ result: { ok: true, value: { ref: 'ACME_IMAGES_API_KEY' } } }),
  }
}

describe('image-generation plugin custom provider controller', () => {
  it('stages and saves a custom provider with its API key', async () => {
    const settings = scope()
    const secret = credentials()
    const controller = new ImageSettingsController(settings as never, { credentials: secret } as never)
    const face = controller.inject()

    face.edit('provider', 'acme-images')
    face.edit('displayName', 'Acme Images')
    face.edit('baseURL', 'https://gateway.example/v1')
    face.edit('model', 'image-gen-2')
    face.edit('apiKey', 'secret-key')

    expect(face.hooks.imageSettings.getSnapshot()).toMatchObject({
      provider: 'acme-images', baseURL: 'https://gateway.example/v1', model: 'image-gen-2',
      dirty: true, invalid: false,
    })

    face.save()
    await vi.waitFor(() => { expect(settings.set).toHaveBeenCalledWith('imageProvider', 'acme-images') })
    await vi.waitFor(() => { expect(secret.set).toHaveBeenCalledWith({ ref: 'ACME_IMAGES_API_KEY', value: 'secret-key' }) })
    await vi.waitFor(() => { expect(face.hooks.imageSettings.getSnapshot().dirty).toBe(false) })
    expect(settings.set).toHaveBeenCalledWith('imageDisplayName', 'Acme Images')
    expect(settings.set).toHaveBeenCalledWith('imageBaseURL', 'https://gateway.example/v1')
    expect(settings.set).toHaveBeenCalledWith('model', 'image-gen-2')
  })

  it('requires a reachable endpoint and a model; any provider id label is accepted', async () => {
    const settings = scope()
    const controller = new ImageSettingsController(settings as never, { credentials: credentials() } as never)
    const face = controller.inject()

    // The provider id is a dispatch label, not a route key: digits are fine.
    face.edit('provider', '222')
    face.edit('baseURL', 'not a url')
    face.edit('model', 'gpt')
    expect(face.hooks.imageSettings.getSnapshot().invalid).toBe(true)

    face.edit('baseURL', 'https://rayplus.site/v1')
    expect(face.hooks.imageSettings.getSnapshot().invalid).toBe(false)

    face.edit('model', '')
    expect(face.hooks.imageSettings.getSnapshot().invalid).toBe(true)
  })

  it('discards staged edits without touching the host', () => {
    const settings = scope({ imageProvider: 'acme-images', imageBaseURL: 'https://gateway.example/v1', model: 'image-gen-2' })
    const controller = new ImageSettingsController(settings as never, { credentials: credentials() } as never)
    const face = controller.inject()

    face.edit('model', 'other-model')
    expect(face.hooks.imageSettings.getSnapshot().model).toBe('other-model')

    face.discard()
    expect(face.hooks.imageSettings.getSnapshot().model).toBe('image-gen-2')
    expect(face.hooks.imageSettings.getSnapshot().dirty).toBe(false)
    expect(settings.set).not.toHaveBeenCalled()
  })
})
