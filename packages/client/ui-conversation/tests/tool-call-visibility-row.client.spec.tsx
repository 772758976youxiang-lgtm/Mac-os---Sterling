// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import { createSnapshotStore, type SessionListState, type WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { ToolCallVisibilityRow } from '../src/client/settings/ToolCallVisibilityRow.tsx'
import type { ToolCallVisibilityRowProps } from '../src/client/settings/ToolCallVisibilityRow.tsx'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

function mount() {
  const visibility = createSnapshotStore(true)
  const setShowToolCalls = vi.fn((visible: boolean) => { visibility.set(visible) })
  const sessions = createSnapshotStore<SessionListState>({
    ids: [], byId: {}, current: undefined, phase: 'ready', subagentsByParent: {}, jobsBySession: {},
    currentAddress: undefined,
  })
  const workspaces = createSnapshotStore<WorkspaceListState>({
    items: [], archivedSessionIds: [], state: 'idle', phase: 'ready', error: null,
    baselinesReady: true, recentWorkspaceId: undefined,
  })
  const props: ToolCallVisibilityRowProps = {
    useSessions: bindSnapshotSelector(sessions),
    useWorkspaces: bindSnapshotSelector(workspaces),
    useShowToolCalls: bindSnapshotSelector(visibility),
    setShowToolCalls,
    t: makeTranslate(en),
  }
  render(<ToolCallVisibilityRow {...props} />)
  return { setShowToolCalls }
}

describe('ToolCallVisibilityRow', () => {
  it('explains the display-only scope and toggles the preference', () => {
    const h = mount()
    expect(screen.getByText('Show tool calls')).toBeDefined()
    expect(screen.getByText('Hides tool-call rows (such as MCP tools) from the transcript when off; model behavior is unaffected')).toBeDefined()
    const toggle = screen.getByRole('switch', { name: 'Show tool calls' })
    expect(toggle.getAttribute('aria-checked')).toBe('true')

    fireEvent.click(toggle)
    expect(h.setShowToolCalls).toHaveBeenCalledWith(false)
    expect(toggle.getAttribute('aria-checked')).toBe('false')
  })
})
