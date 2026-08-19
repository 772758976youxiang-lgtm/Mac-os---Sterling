/** Browser-side staged settings and credential controller for a custom vision provider. */

import type { IApiClient } from '@deepseek-ai/dsh-client-connection/client'
import type { SettingsScope, SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'

/** The Host namespace registered by the local image-generation MCP bridge. */
export const MCP_IMAGE_GENERATION_NS = 'mcp-image-generation'

/** Protocol choices shared with the model-provider configuration surface. */
export const VISION_API_PROTOCOLS = [
  'openai-completions',
  'openai-responses',
  'anthropic-messages',
  'openai-image-generations',
] as const
const DEFAULT_API = VISION_API_PROTOCOLS[0]
const DEFAULT_API_KEY_REF = 'STERLING_VISION_API_KEY'
/** Settings fields owned by the local image-understanding plugin. */
export interface VisionSettings {
  visionProvider?: string
  visionDisplayName?: string
  visionBaseURL?: string
  visionApi?: string
  visionApiKeyEnv?: string
  visionModel?: string
}

/** Reactive state shown by the custom provider form. */
export interface VisionSettingsState {
  available: boolean
  writable: boolean
  saving: boolean
  failed: boolean
  dirty: boolean
  invalid: boolean
  provider: string
  displayName: string
  baseURL: string
  api: string
  model: string
  apiKeyDraft: string
  apiKeyConfigured: boolean
  apiKeyWritable: boolean
}

/** Face injected into the plugin configuration card. */
export interface VisionSettingsFace {
  hooks: {
    visionSettings: SnapshotStore<VisionSettingsState>
  }
  edit: (field: 'provider' | 'displayName' | 'baseURL' | 'api' | 'model' | 'apiKey', value: string) => void
  refresh: () => void
  save: () => void
  discard: () => void
}

function providerKeyRef(provider: string): string {
  const normalized = provider.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return normalized.length === 0 ? DEFAULT_API_KEY_REF : `${normalized}_API_KEY`
}

function normalizedBaseURL(value: string): string {
  const trimmed = value.trim()
  return trimmed !== '' && !/^https?:\/\//i.test(trimmed) ? `https://${trimmed}` : trimmed
}

function validBaseURL(value: string): boolean {
  try {
    const url = new URL(normalizedBaseURL(value))
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch (_error) {
    return false
  }
}

/** Owns staged custom provider fields and the write-only API key. */
export class VisionSettingsController {
  private readonly store: SnapshotStore<VisionSettingsState>
  private providerDraft: string | undefined
  private displayNameDraft: string | undefined
  private baseURLDraft: string | undefined
  private apiDraft: string | undefined
  private modelDraft: string | undefined
  private apiKeyDraft = ''
  private saving = false
  private failed = false
  private credentialLoaded = false
  private credential = { ref: '', configured: false, writable: true }

  constructor(
    private readonly scope: SettingsScope<VisionSettings>,
    private readonly api: Pick<IApiClient, 'credentials'>,
  ) {
    this.store = createSnapshotStore(this.projection())
    scope.subscribe(() => {
      this.publish()
      if (this.credentialLoaded) void this.readCredential()
    })
  }

  private value(field: keyof VisionSettings): string {
    const snapshot = this.scope.getSnapshot().value
    const staged = field === 'visionProvider' ? this.providerDraft
      : field === 'visionDisplayName' ? this.displayNameDraft
        : field === 'visionBaseURL' ? this.baseURLDraft
          : field === 'visionApi' ? this.apiDraft
            : field === 'visionModel' ? this.modelDraft
              : undefined
    if (staged !== undefined) return staged
    // Pre-custom-provider releases stored only a Qwen model id. It is not a
    // usable custom route, so keep legacy route details from reappearing in
    // the new form until the user supplies a provider and endpoint.
    if (field !== 'visionProvider' && this.provider() === '' && (
      field === 'visionDisplayName' || field === 'visionBaseURL' || field === 'visionModel'
    )) return ''
    const current = snapshot?.[field]
    if (typeof current === 'string') return current
    return field === 'visionApi' ? DEFAULT_API : ''
  }

  private provider(): string { return this.value('visionProvider') }

  private apiKeyRef(): string {
    const stored = this.scope.getSnapshot().value?.visionApiKeyEnv?.trim()
    return stored || providerKeyRef(this.provider())
  }

  private valid(): boolean {
    return this.provider().trim() !== ''
      && this.value('visionBaseURL').trim() !== ''
      && validBaseURL(this.value('visionBaseURL'))
      && this.value('visionModel').trim() !== ''
      && VISION_API_PROTOCOLS.includes(this.value('visionApi') as typeof VISION_API_PROTOCOLS[number])
  }

  /** Build the view from the current scope and staged form values. */
  private projection(): VisionSettingsState {
    const snapshot = this.scope.getSnapshot()
    const dirty = this.providerDraft !== undefined
      || this.displayNameDraft !== undefined
      || this.baseURLDraft !== undefined
      || this.apiDraft !== undefined
      || this.modelDraft !== undefined
      || this.apiKeyDraft.length > 0
    return {
      available: snapshot.status === 'ready',
      writable: snapshot.writable,
      saving: this.saving,
      failed: this.failed,
      dirty,
      invalid: dirty && !this.valid(),
      provider: this.provider(),
      displayName: this.value('visionDisplayName'),
      baseURL: this.value('visionBaseURL'),
      api: this.value('visionApi'),
      model: this.value('visionModel'),
      apiKeyDraft: this.apiKeyDraft,
      apiKeyConfigured: this.credential.ref === this.apiKeyRef() && this.credential.configured,
      apiKeyWritable: this.credential.ref === this.apiKeyRef() ? this.credential.writable : true,
    }
  }

  private publish(): void { this.store.set(this.projection()) }

  /** Refresh the value-free credential status after external changes. */
  refresh(ref?: string): void {
    if (!this.credentialLoaded && ref === undefined) return
    if (ref !== undefined && ref !== this.apiKeyRef()) return
    this.credentialLoaded = true
    void this.readCredential()
  }

  private async readCredential(): Promise<void> {
    const ref = this.apiKeyRef()
    if (ref !== this.credential.ref) {
      this.credential = { ref, configured: false, writable: true }
      this.publish()
    }
    try {
      const response = await this.api.credentials.describe({ refs: [ref] })
      if (!response.result.ok || ref !== this.apiKeyRef()) return
      const view = response.result.value.credentials[ref]
      this.credential = {
        ref,
        configured: view?.configured ?? false,
        writable: view?.writable ?? true,
      }
      this.publish()
    } catch (_readFailure) {
      // Keep the form usable; the Host remains authoritative when saving.
    }
  }

  /** Stage one custom provider field without crossing the wire. */
  edit(field: 'provider' | 'displayName' | 'baseURL' | 'api' | 'model' | 'apiKey', value: string): void {
    if (field === 'provider') this.providerDraft = value
    else if (field === 'displayName') this.displayNameDraft = value
    else if (field === 'baseURL') this.baseURLDraft = value
    else if (field === 'api') this.apiDraft = value
    else if (field === 'model') this.modelDraft = value
    else this.apiKeyDraft = value
    this.failed = false
    this.publish()
    if (field === 'provider') {
      this.credentialLoaded = true
      void this.readCredential()
    }
  }

  /** Persist the custom route and optional write-only key. */
  save(): void {
    const state = this.projection()
    if (this.saving || !state.dirty || state.invalid) return
    this.saving = true
    this.failed = false
    this.publish()
    void (async () => {
      try {
        const current = this.scope.getSnapshot().value
        const values: Array<[keyof VisionSettings, string]> = [
          ['visionProvider', this.provider()],
          ['visionDisplayName', this.value('visionDisplayName')],
          ['visionBaseURL', normalizedBaseURL(this.value('visionBaseURL'))],
          ['visionApi', this.value('visionApi')],
          ['visionModel', this.value('visionModel')],
        ]
        for (const [field, value] of values) {
          if (value !== (current?.[field] ?? (field === 'visionApi' ? DEFAULT_API : ''))) {
            await this.scope.set(field, value)
          }
        }
        if (this.apiKeyDraft.trim() !== '') {
          await this.api.credentials.set({ ref: this.apiKeyRef(), value: this.apiKeyDraft.trim() })
        }
        this.providerDraft = undefined
        this.displayNameDraft = undefined
        this.baseURLDraft = undefined
        this.apiDraft = undefined
        this.modelDraft = undefined
        this.apiKeyDraft = ''
        await this.readCredential()
      } catch (_writeFailure) {
        this.failed = true
      } finally {
        this.saving = false
        this.publish()
      }
    })()
  }

  /** Drop staged custom provider fields. */
  discard(): void {
    this.providerDraft = undefined
    this.displayNameDraft = undefined
    this.baseURLDraft = undefined
    this.apiDraft = undefined
    this.modelDraft = undefined
    this.apiKeyDraft = ''
    this.failed = false
    this.publish()
    void this.readCredential()
  }

  /** Return the registration face consumed by the slot renderer. */
  inject(): VisionSettingsFace {
    return {
      hooks: { visionSettings: this.store },
      edit: (field, value) => { this.edit(field, value) },
      refresh: () => { this.refresh() },
      save: () => { this.save() },
      discard: () => { this.discard() },
    }
  }
}

/** No-op face used by minimal test/composition hosts that omit Settings. */
export function unavailableVisionSettingsFace(): VisionSettingsFace {
  const state: VisionSettingsState = {
    available: false,
    writable: false,
    saving: false,
    failed: false,
    dirty: false,
    invalid: false,
    provider: '',
    displayName: '',
    baseURL: '',
    api: DEFAULT_API,
    model: '',
    apiKeyDraft: '',
    apiKeyConfigured: false,
    apiKeyWritable: false,
  }
  return {
    hooks: { visionSettings: createSnapshotStore(state) },
    edit: () => {},
    refresh: () => {},
    save: () => {},
    discard: () => {},
  }
}
