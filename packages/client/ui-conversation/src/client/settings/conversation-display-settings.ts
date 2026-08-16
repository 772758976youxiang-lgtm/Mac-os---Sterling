/** Live, durable conversation-display preferences. */
import {
  createSnapshotStore, type SettingsScope, type SnapshotStore,
} from '@deepseek-ai/dsh-client-runtime/client'
import {
  DEFAULT_SHOW_CONTEXT_INJECTIONS, SHOW_CONTEXT_INJECTIONS_FIELD, type ConversationSettings,
} from '../../submission-settings.ts'

/** Keeps transcript display preferences synchronized with the Host settings scope. */
export class ConversationDisplaySettings {
  readonly showContextInjections: SnapshotStore<boolean> = createSnapshotStore(DEFAULT_SHOW_CONTEXT_INJECTIONS)
  private readonly host: SettingsScope<ConversationSettings> | undefined

  constructor(host?: SettingsScope<ConversationSettings>) {
    this.host = host
    if (host !== undefined) {
      host.subscribe(() => { this.adopt(host) })
      this.adopt(host)
    }
  }

  /** Publish immediately, then persist the preference through the Host scope. */
  setShowContextInjections(visible: boolean): void {
    if (this.showContextInjections.getSnapshot() === visible) return
    this.showContextInjections.set(visible)
    void this.host?.set(SHOW_CONTEXT_INJECTIONS_FIELD, visible)
  }

  private adopt(host: SettingsScope<ConversationSettings>): void {
    const section = host.getSnapshot().value
    if (section === undefined || this.showContextInjections.getSnapshot() === section.showContextInjections) return
    this.showContextInjections.set(section.showContextInjections)
  }
}
