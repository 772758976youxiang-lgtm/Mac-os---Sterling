/** Read-only projection of the current Cordis Loader plugin entries. */

import type { Context, FiberState } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-tools'
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
// Typert-generated ./typert and ./remote artifacts import Zod at runtime.
import type {} from 'zod'
import type {
  PluginEntryId,
  PluginFiberPhase,
  PluginInventoryEntry,
  PluginInventorySnapshot,
  McpInventorySnapshot,
  McpServerInventoryEntry,
} from './types.ts'

export type * from './types.ts'

/** Brand an existing Loader-tree entry id at the owning boundary. */
function pluginEntryId(value: string): PluginEntryId {
  return value as PluginEntryId
}

/** Runtime mirror: FiberState is a cross-package const enum. */
const FIBER_STATE = {
  PENDING: 0 as FiberState.PENDING,
  LOADING: 1 as FiberState.LOADING,
  ACTIVE: 2 as FiberState.ACTIVE,
  FAILED: 3 as FiberState.FAILED,
  DISPOSED: 4 as FiberState.DISPOSED,
  UNLOADING: 5 as FiberState.UNLOADING,
} as const

/** Complete public projection of Cordis Fiber states. */
const FIBER_PHASE = {
  [FIBER_STATE.PENDING]: 'pending',
  [FIBER_STATE.LOADING]: 'loading',
  [FIBER_STATE.ACTIVE]: 'active',
  [FIBER_STATE.FAILED]: 'failed',
  [FIBER_STATE.DISPOSED]: null,
  [FIBER_STATE.UNLOADING]: 'unloading',
} as const satisfies Record<FiberState, PluginFiberPhase>

const MCP_CLIENT_MODULE = '@deepseek-ai/dsh-mcp-client'
const MCP_IMAGE_GENERATION_MODULE = '@deepseek-ai/dsh-mcp-image-generation'

/** Read the non-sensitive MCP facts that remain meaningful in a Loader entry. */
function mcpConfig(config: unknown): { serverName: string; transport: McpServerInventoryEntry['transport'] } | undefined {
  if (config === null || typeof config !== 'object') return undefined
  const candidate = config as { serverName?: unknown; transport?: unknown }
  if (typeof candidate.serverName !== 'string') return undefined
  return {
    serverName: candidate.serverName,
    transport: candidate.transport === 'stdio' || candidate.transport === 'streamable-http'
      ? candidate.transport
      : null,
  }
}

/** Remote-only service exposing the Loader's current non-group entry state. */
export class PluginInventoryGateway extends TypertRemoteService {
  static inject = ['loader']

  constructor(ctx: Context) {
    super(ctx, 'pluginInventory')
  }

  /**
   * Read the Loader directly on every call. Cordis's internal plugin/status
   * events already maintain Entry.fiber and Fiber.state, so a second cache
   * would only add another lifecycle truth to keep synchronized.
   * @returns Current non-group Loader entries in Loader order.
   */
  @Remote('list')
  list(): PluginInventorySnapshot {
    const entries: PluginInventoryEntry[] = []
    for (const entry of this.ctx.loader.entries()) {
      if (entry.options.group) continue
      entries.push({
        entryId: pluginEntryId(entry.id),
        moduleName: entry.options.name,
        enabled: !entry.disabled,
        fiberPhase: entry.fiber === undefined ? null : FIBER_PHASE[entry.fiber.state],
      })
    }
    return { entries }
  }

  /**
   * Read configured MCP clients and their currently registered capabilities.
   * Connection secrets and transport-specific process details never cross this
   * Remote; the browser only needs the namespace, lifecycle, and discoverable
   * tools it can show in Settings.
   * @returns Current MCP server capability inventory in Loader order.
   */
  @Remote('mcp')
  mcp(): McpInventorySnapshot {
    const schemas = this.ctx.get('tools')?.schemas() ?? []
    const servers: McpServerInventoryEntry[] = []
    for (const entry of this.ctx.loader.entries()) {
      if (entry.options.group) continue
      const config = entry.options.name === MCP_IMAGE_GENERATION_MODULE
        ? { serverName: 'image', transport: 'local' as const }
        : entry.options.name === MCP_CLIENT_MODULE ? mcpConfig(entry.options.config) : undefined
      if (config === undefined) continue
      const prefixes = config.serverName === 'image'
        ? ['mcp__image__', 'mcp__vision__']
        : [`mcp__${config.serverName}__`]
      servers.push({
        entryId: pluginEntryId(entry.id),
        serverName: config.serverName,
        transport: config.transport,
        enabled: !entry.disabled,
        fiberPhase: entry.fiber === undefined ? null : FIBER_PHASE[entry.fiber.state],
        tools: schemas
          .filter(schema => prefixes.some(prefix => schema.name.startsWith(prefix)))
          .map(({ name, description }) => ({ name, description })),
      })
    }
    return { servers }
  }
}

export default PluginInventoryGateway
