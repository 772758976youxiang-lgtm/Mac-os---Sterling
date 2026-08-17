import { afterEach, describe, expect, it } from 'vitest'
import { Context, type Plugin } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import PluginInventoryGateway from '../src/index.ts'

const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

const activePlugin: Plugin.Function = () => {}
const pendingPlugin: Plugin.Object = {
  inject: ['neverReady'],
  apply() {},
}

async function harness(): Promise<{
  ctx: Context
  inventory: PluginInventoryGateway
}> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(Loader)
  ctx.loader.builtins.active = activePlugin
  ctx.loader.builtins.pending = pendingPlugin
  ctx.loader.internal = {
    import: async (name: string) => {
      if (name === '@deepseek-ai/dsh-mcp-client'
        || name === '@deepseek-ai/dsh-mcp-image-generation'
        || name === '@deepseek-ai/dsh-email-digest') return activePlugin
      throw new Error(`unexpected module ${name}`)
    },
  } as never
  ctx.provide('tools', {
    schemas: () => [
      { name: 'mcp__github__create_issue', description: 'Create a GitHub issue', parameters: {} },
      { name: 'mcp__github__list_issues', description: 'List GitHub issues', parameters: {} },
      { name: 'web_search', description: 'Search the web', parameters: {} },
    ],
  } as never)
  await ctx.plugin(PluginInventoryGateway)
  const inventory = ctx.get('pluginInventory') as PluginInventoryGateway
  return { ctx, inventory }
}

describe('PluginInventoryGateway', () => {
  it('publishes direct plugin and MCP inventory methods under the pluginInventory namespace', async () => {
    const { inventory } = await harness()
    expect(inventory.typertRemote).toMatchObject({
      serviceKey: 'pluginInventory',
      namespace: 'pluginInventory',
    })
    expect(remoteMethods(inventory)).toEqual([
      { method: 'list', invocation: { kind: 'direct' } },
      { method: 'mcp', invocation: { kind: 'direct' } },
    ])
  })

  it('projects configured MCP clients with only their discovered public tools', async () => {
    const { ctx, inventory } = await harness()
    const githubId = await ctx.loader.create({
      name: '@deepseek-ai/dsh-mcp-client',
      config: { serverName: 'github', transport: 'stdio' },
    })
    const brokenId = await ctx.loader.create({
      name: '@deepseek-ai/dsh-mcp-client',
      config: { serverName: 'broken', transport: 'streamable-http' },
      disabled: true,
    })

    expect(inventory.mcp()).toEqual({
      servers: [
        {
          entryId: githubId,
          serverName: 'github',
          transport: 'stdio',
          enabled: true,
          fiberPhase: 'active',
          tools: [
            { name: 'mcp__github__create_issue', description: 'Create a GitHub issue' },
            { name: 'mcp__github__list_issues', description: 'List GitHub issues' },
          ],
        },
        {
          entryId: brokenId,
          serverName: 'broken',
          transport: 'streamable-http',
          enabled: false,
          fiberPhase: null,
          tools: [],
        },
      ],
    })
  })

  it('includes the local image-generation bridge in the MCP inventory', async () => {
    const { ctx, inventory } = await harness()
    const imageId = await ctx.loader.create({ name: '@deepseek-ai/dsh-mcp-image-generation' })
    expect(inventory.mcp()).toMatchObject({
      servers: [{
        entryId: imageId,
        serverName: 'image',
        transport: 'local',
        enabled: true,
        fiberPhase: 'active',
      }],
    })
  })

  it('includes the local email delivery bridge in the MCP inventory', async () => {
    const { ctx, inventory } = await harness()
    const emailId = await ctx.loader.create({ name: '@deepseek-ai/dsh-email-digest' })
    expect(inventory.mcp()).toMatchObject({
      servers: [{
        entryId: emailId,
        serverName: 'email',
        transport: 'local',
        enabled: true,
        fiberPhase: 'active',
      }],
    })
  })

  it('projects current non-group Loader entries without a second cache', async () => {
    const { ctx, inventory } = await harness()
    const activeId = await ctx.loader.create({ name: 'cordis:active' })
    const pendingId = await ctx.loader.create({ name: 'cordis:pending' })
    const disabledId = await ctx.loader.create({
      name: 'cordis:not-installed',
      disabled: true,
    })
    await ctx.loader.create({ name: 'cordis:active', group: true })

    const snapshot = inventory.list()
    expect(snapshot.entries).toHaveLength(3)
    expect(snapshot.entries).toEqual(expect.arrayContaining([
      {
        entryId: activeId,
        moduleName: 'cordis:active',
        enabled: true,
        fiberPhase: 'active',
      },
      {
        entryId: pendingId,
        moduleName: 'cordis:pending',
        enabled: true,
        fiberPhase: 'pending',
      },
      {
        entryId: disabledId,
        moduleName: 'cordis:not-installed',
        enabled: false,
        fiberPhase: null,
      },
    ]))

    await ctx.loader.update(activeId, { disabled: true })
    expect(inventory.list().entries.find(entry => entry.entryId === activeId)).toEqual({
      entryId: activeId,
      moduleName: 'cordis:active',
      enabled: false,
      fiberPhase: null,
    })

    await ctx.loader.remove(pendingId)
    expect(inventory.list().entries.some(entry => entry.entryId === pendingId)).toBe(false)
  })
})
