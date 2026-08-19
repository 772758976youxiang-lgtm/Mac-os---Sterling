// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import { createSnapshotStore, type SessionListState, type WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { ThinkingVisibilityRow } from '../src/client/settings/ThinkingVisibilityRow.tsx'
import type { ThinkingVisibilityRowProps } from '../src/client/settings/ThinkingVisibilityRow.tsx'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

function mount() {
  const visibility = createSnapshotStore(true)
  const setShowThinking = vi.fn((visible: boolean) => { visibility.set(visible) })
  const sessions = createSnapshotStore<SessionListState>({
    ids: [], byId: {}, current: undefined, phase: 'ready', subagentsByParent: {}, jobsBySession: {},
    currentAddress: undefined,
  })
  const workspaces = createSnapshotStore<WorkspaceListState>({
    items: [], archivedSessionIds: [], state: 'idle', phase: 'ready', error: null,
    baselinesReady: true, recentWorkspaceId: undefined,
  })
  const props: ThinkingVisibilityRowProps = {
    useSessions: bindSnapshotSelector(sessions),
    useWorkspaces: bindSnapshotSelector(workspaces),
    useShowThinking: bindSnapshotSelector(visibility),
    setShowThinking,
    t: makeTranslate(en),
  }
  render(<ThinkingVisibilityRow {...props} />)
  return { setShowThinking }
}

describe('ThinkingVisibilityRow', () => {
  it('explains the display-only scope and toggles the preference', () => {
    const h = mount()
    expect(screen.getByText('Show thinking process')).toBeDefined()
    expect(screen.getByText('Hides the assistant reasoning rows from the transcript when off; model behavior is unaffected')).toBeDefined()
    const toggle = screen.getByRole('switch', { name: 'Show thinking process' })
    expect(toggle.getAttribute('aria-checked')).toBe('true')

    fireEvent.click(toggle)
    expect(h.setShowThinking).toHaveBeenCalledWith(false)
    expect(toggle.getAttribute('aria-checked')).toBe('false')
  })
})
