/** Busy-Enter preference stored in the Host user-settings document. */

import z from '@deepseek-ai/schemastery'

/** Settings namespace owned by the conversation plugin. */
export const CONVERSATION_SETTINGS_NAMESPACE = 'ui-conversation'

/** Field carrying the delivery mode for plain Enter while an agent is busy. */
export const BUSY_ENTER_FIELD = 'busyEnter'

/** Field controlling whether injected-context records appear in the chat transcript. */
export const SHOW_CONTEXT_INJECTIONS_FIELD = 'showContextInjections'

/** Field controlling whether tool-call records appear in the chat transcript. */
export const SHOW_TOOL_CALLS_FIELD = 'showToolCalls'

/** Busy-Enter behaviors accepted at settings and input boundaries. */
export const BUSY_ENTER_BEHAVIORS = ['queue', 'steer'] as const

/** Configurable meaning of plain Enter while the addressed agent is busy. */
export type BusyEnterBehavior = typeof BUSY_ENTER_BEHAVIORS[number]

/** Default preserves Enter-as-Queue for running conversations. */
export const DEFAULT_BUSY_ENTER_BEHAVIOR: BusyEnterBehavior = 'queue'

/** Preserve the existing visible transcript until the user opts into a cleaner view. */
export const DEFAULT_SHOW_CONTEXT_INJECTIONS = true

/** Keep tool-call rows visible until the user opts into a cleaner view. */
export const DEFAULT_SHOW_TOOL_CALLS = true

/** Durable conversation section shared by the Host schema and the browser scope. */
export interface ConversationSettings {
  /** Delivery mode for plain Enter while the addressed agent is busy. */
  busyEnter: BusyEnterBehavior
  /** Presentation-only preference for context-injection rows. */
  showContextInjections: boolean
  /** Presentation-only preference for tool-call rows (MCP and friends). */
  showToolCalls: boolean
}

/** Durable conversation schema; also the wire envelope the browser scope validates against. */
export const ConversationSettingsSchema: z<ConversationSettings> = z.object({
  [BUSY_ENTER_FIELD]: z.union([...BUSY_ENTER_BEHAVIORS]).default(DEFAULT_BUSY_ENTER_BEHAVIOR),
  [SHOW_CONTEXT_INJECTIONS_FIELD]: z.boolean().default(DEFAULT_SHOW_CONTEXT_INJECTIONS),
  [SHOW_TOOL_CALLS_FIELD]: z.boolean().default(DEFAULT_SHOW_TOOL_CALLS),
})
