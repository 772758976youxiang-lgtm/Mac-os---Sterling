/** Browser-side staged settings and credential controller for Qwen vision. */

import type { IApiClient } from '@deepseek-ai/dsh-client-connection/client'
import type { SettingsScope, SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'

/** The Host namespace registered by the local image-generation MCP bridge. */
export const MCP_IMAGE_GENERATION_NS = 'mcp-image-generation'
const DEFAULT_API_KEY_REF = 'DASHSCOPE_API_KEY'
const DEFAULT_MODEL = 'qwen3.7-flash'
const DEFAULT_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'

/** Settings fields owned by the local image-understanding plugin. */
export interface VisionSettings {
  visionApiKeyEnv?: string
  visionBaseURL?: string
  visionModel?: string
}

/** Reactive state shown by the vision plugin card. */
export interface VisionSettingsState {
  available: boolean
  writable: boolean
  saving: boolean
  failed: boolean
  dirty: boolean
  invalid: boolean
  apiKeyRef: string
  apiKeyDraft: string
  apiKeyConfigured: boolean
  apiKeyWritable: boolean
  model: string
  baseURL: string
}

/** Face injected into the plugin configuration card. */
export interface VisionSettingsFace {
  hooks: {
    visionSettings: SnapshotStore<VisionSettingsState>
  }
  edit: (field: 'apiKey' | 'apiKeyRef', value: string) => void
  save: () => void
  discard: () => void
}

/** Owns staged text and writes the settings field plus write-only API key. */
export class VisionSettingsController {
  private readonly store: SnapshotStore<VisionSettingsState>
  private apiKeyDraft = ''
  private apiKeyRefDraft: string | undefined
  private saving = false
  private failed = false
  private credential = { ref: '', configured: false, writable: true }

  constructor(
    private readonly scope: SettingsScope<VisionSettings>,
    private readonly api: Pick<IApiClient, 'credentials'>,
  ) {
    this.store = createSnapshotStore(this.projection())
    scope.subscribe(() => {
      if (this.apiKeyRefDraft === undefined) this.publish()
      void this.readCredential()
    })
    void this.readCredential()
  }

  /** Build the view from the current scope and staged edits. */
  private projection(): VisionSettingsState {
    const snapshot = this.scope.getSnapshot()
    const value = snapshot.value
    const apiKeyRef = this.apiKeyRefDraft ?? (value?.visionApiKeyEnv ?? DEFAULT_API_KEY_REF)
    return {
      available: snapshot.status === 'ready',
      writable: snapshot.writable,
      saving: this.saving,
      failed: this.failed,
      dirty: this.apiKeyDraft.length > 0 || this.apiKeyRefDraft !== undefined,
      invalid: false,
      apiKeyRef,
      apiKeyDraft: this.apiKeyDraft,
      apiKeyConfigured: this.credential.ref === apiKeyRef && this.credential.configured,
      apiKeyWritable: this.credential.ref === apiKeyRef ? this.credential.writable : true,
      model: value?.visionModel ?? DEFAULT_MODEL,
      baseURL: value?.visionBaseURL ?? DEFAULT_BASE_URL,
    }
  }

  private publish(): void {
    this.store.set(this.projection())
  }

  private ref(): string {
    const value = this.scope.getSnapshot().value?.visionApiKeyEnv
    return (this.apiKeyRefDraft ?? value ?? DEFAULT_API_KEY_REF).trim() || DEFAULT_API_KEY_REF
  }

  /** Refresh the value-free credential status for the currently selected ref. */
  private async readCredential(): Promise<void> {
    const ref = this.ref()
    if (ref !== this.credential.ref) {
      this.credential = { ref, configured: false, writable: true }
      this.publish()
    }
    try {
      const response = await this.api.credentials.describe({ refs: [ref] })
      if (!response.result.ok || ref !== this.ref()) return
      const view = response.result.value.credentials[ref]
      this.credential = {
        ref,
        configured: view?.configured ?? false,
        writable: view?.writable ?? true,
      }
      this.publish()
    } catch (_readFailure) {
      // Keep the key control usable; the Host remains authoritative on save.
    }
  }

  /** Stage one visible field without crossing the wire. */
  edit(field: 'apiKey' | 'apiKeyRef', value: string): void {
    if (field === 'apiKey') this.apiKeyDraft = value
    else this.apiKeyRefDraft = value
    this.failed = false
    this.publish()
    if (field === 'apiKeyRef') void this.readCredential()
  }

  /** Persist the selected credential reference and optional new key. */
  save(): void {
    if (this.saving || !this.projection().dirty) return
    this.saving = true
    this.failed = false
    this.publish()
    void (async () => {
      try {
        const nextRef = this.ref()
        const currentRef = this.scope.getSnapshot().value?.visionApiKeyEnv ?? DEFAULT_API_KEY_REF
        if (nextRef !== currentRef) await this.scope.set('visionApiKeyEnv', nextRef)
        if (this.apiKeyDraft.trim() !== '') await this.api.credentials.set({ ref: nextRef, value: this.apiKeyDraft })
        this.apiKeyDraft = ''
        this.apiKeyRefDraft = undefined
        await this.readCredential()
      } catch (_writeFailure) {
        this.failed = true
      } finally {
        this.saving = false
        this.publish()
      }
    })()
  }

  /** Drop staged text and restore the latest Host-backed values. */
  discard(): void {
    this.apiKeyDraft = ''
    this.apiKeyRefDraft = undefined
    this.failed = false
    this.publish()
    void this.readCredential()
  }

  /** Return the registration face consumed by the slot renderer. */
  inject(): VisionSettingsFace {
    return {
      hooks: { visionSettings: this.store },
      edit: (field, value) => { this.edit(field, value) },
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
    apiKeyRef: DEFAULT_API_KEY_REF,
    apiKeyDraft: '',
    apiKeyConfigured: false,
    apiKeyWritable: false,
    model: DEFAULT_MODEL,
    baseURL: DEFAULT_BASE_URL,
  }
  return {
    hooks: { visionSettings: createSnapshotStore(state) },
    edit: () => {},
    save: () => {},
    discard: () => {},
  }
}
