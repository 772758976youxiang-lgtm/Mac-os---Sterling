// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { McpManagementSettingsTab } from '../src/client/McpManagementSettingsTab.tsx'
import type {
  McpManagementSettingsTabInjected,
  McpManagementSettingsTabProps,
} from '../src/client/McpManagementSettingsTab.tsx'
import { en, type PluginInventoryLocaleKey } from '../src/client/locales.ts'
import type { McpVisionSettingsState } from '../src/client/mcp-vision-settings-controller.ts'

afterEach(cleanup)

type Snapshot = Awaited<ReturnType<McpManagementSettingsTabInjected['list']>>
const t = ((key: PluginInventoryLocaleKey, values?: Record<string, string | number>): string => {
  const text = en[key]
  return values === undefined ? text : Object.entries(values).reduce(
    (result, [name, value]) => result.replace(`{${name}}`, String(value)),
    text,
  )
}) as McpManagementSettingsTabProps['t']

const SNAPSHOT = {
  servers: [
    {
      entryId: 'mcp-github',
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
      entryId: 'mcp-docs',
      serverName: 'docs',
      transport: 'streamable-http',
      enabled: true,
      fiberPhase: 'loading',
      tools: [],
    },
  ],
} as unknown as Snapshot

function props(list: McpManagementSettingsTabInjected['list']): McpManagementSettingsTabProps {
  const vision: McpVisionSettingsState = {
    available: true,
    writable: true,
    saving: false,
    failed: false,
    dirty: false,
    apiKeyRef: 'DASHSCOPE_API_KEY',
    apiKeyDraft: '',
    apiKeyConfigured: false,
    apiKeyWritable: true,
    model: 'qwen3.7-flash',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  }
  return {
    t,
    list,
    useMcpVisionSettings: (selector: (state: McpVisionSettingsState) => unknown) => selector(vision),
    edit: () => {},
    save: () => {},
    discard: () => {},
  } as McpManagementSettingsTabProps
}

describe('McpManagementSettingsTab', () => {
  it('lists MCP servers and reveals each server capability list', async () => {
    render(<McpManagementSettingsTab {...props(async () => SNAPSHOT)} />)

    expect(await screen.findByRole('heading', { name: en.mcpCatalog })).toBeTruthy()
    expect(screen.getByRole('searchbox', { name: en.mcpSearch })).toBeTruthy()
    const github = screen.getByRole('button', { name: 'github, Connected, 2 capabilities' })
    expect(screen.getByRole('img', { name: en.mcpConnected })).toBeTruthy()
    expect(screen.getByRole('img', { name: en.mcpConnecting })).toBeTruthy()

    fireEvent.click(github)
    expect(screen.getByText('mcp__github__create_issue')).toBeTruthy()
    expect(screen.getByText('Create a GitHub issue')).toBeTruthy()

    fireEvent.change(screen.getByRole('searchbox', { name: en.mcpSearch }), { target: { value: 'list github' } })
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'github, Connected, 2 capabilities' })).toBeTruthy()
  })

  it('retries a failed read without exposing the transport error', async () => {
    const list = vi.fn<McpManagementSettingsTabInjected['list']>()
      .mockRejectedValueOnce(new Error('private network address'))
      .mockResolvedValueOnce({ servers: [] })
    render(<McpManagementSettingsTab {...props(list)} />)

    expect((await screen.findByRole('alert')).textContent).toBe(en.mcpError)
    expect(screen.queryByText('private network address')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en.retry }))
    await act(async () => {})
    expect(await screen.findByText(en.mcpEmpty)).toBeTruthy()
    expect(list).toHaveBeenCalledTimes(2)
  })
})
