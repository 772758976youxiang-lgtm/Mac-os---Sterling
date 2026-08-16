import type { Branded } from '@deepseek-ai/dsh-brand'

/** Stable Loader-tree identity of one configured plugin entry. */
export type PluginEntryId = Branded<'PluginEntryId'>

/** Lifecycle state of an entry's root Fiber, or null when it has no live root Fiber. */
export type PluginFiberPhase =
  | 'pending'
  | 'loading'
  | 'active'
  | 'failed'
  | 'unloading'
  | null

/** One non-group Loader entry exposed to trusted clients. */
export interface PluginInventoryEntry {
  readonly entryId: PluginEntryId
  /** Exact module specifier imported by the Loader entry. */
  readonly moduleName: string
  /** Effective Loader enablement, including disabled ancestor groups. */
  readonly enabled: boolean
  readonly fiberPhase: PluginFiberPhase
}

/** Point-in-time inventory returned by the plugin inventory Remote. */
export interface PluginInventorySnapshot {
  readonly entries: readonly PluginInventoryEntry[]
}

/** One currently discovered MCP tool, projected from the global tool registry. */
export interface McpToolInventoryEntry {
  /** Public tool name available to the agent. */
  readonly name: string
  /** Server-provided summary, when the MCP server advertised one. */
  readonly description: string
}

/** One configured MCP client and the tools it currently contributes. */
export interface McpServerInventoryEntry {
  /** Loader-tree identity of the MCP client instance. */
  readonly entryId: PluginEntryId
  /** MCP namespace used in every public tool name. */
  readonly serverName: string
  /** Transport selected by the configured client instance, if readable. */
  readonly transport: 'stdio' | 'streamable-http' | 'local' | null
  /** Effective Loader enablement, including disabled ancestor groups. */
  readonly enabled: boolean
  /** Current root Fiber phase, or null when no live instance exists. */
  readonly fiberPhase: PluginFiberPhase
  /** Tools discovered from this server and available in the global registry. */
  readonly tools: readonly McpToolInventoryEntry[]
}

/** Point-in-time MCP server and capability inventory returned to trusted clients. */
export interface McpInventorySnapshot {
  readonly servers: readonly McpServerInventoryEntry[]
}
