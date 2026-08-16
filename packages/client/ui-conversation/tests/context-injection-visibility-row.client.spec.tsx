// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import { createSnapshotStore, type SessionListState, type WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { ContextInjectionVisibilityRow } from '../src/client/settings/ContextInjectionVisibilityRow.tsx'
import type { ContextInjectionVisibilityRowProps } from '../src/client/settings/ContextInjectionVisibilityRow.tsx'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

function mount() {
  const visibility = createSnapshotStore(true)
  const setShowContextInjections = vi.fn((visible: boolean) => { visibility.set(visible) })
  const sessions = createSnapshotStore<SessionListState>({
    ids: [], byId: {}, current: undefined, phase: 'ready', subagentsByParent: {}, jobsBySession: {},
    currentAddress: undefined,
  })
  const workspaces = createSnapshotStore<WorkspaceListState>({
    items: [], archivedSessionIds: [], state: 'idle', phase: 'ready', error: null,
    baselinesReady: true, recentWorkspaceId: undefined,
  })
  const props: ContextInjectionVisibilityRowProps = {
    useSessions: bindSnapshotSelector(sessions),
    useWorkspaces: bindSnapshotSelector(workspaces),
    useShowContextInjections: bindSnapshotSelector(visibility),
    setShowContextInjections,
    t: makeTranslate(en),
  }
  render(<ContextInjectionVisibilityRow {...props} />)
  return { setShowContextInjections }
}

describe('ContextInjectionVisibilityRow', () => {
  it('explains the display-only scope and toggles the preference', () => {
    const h = mount()
    expect(screen.getByText('Show context injections')).toBeDefined()
    expect(screen.getByText('Only changes the transcript display; model context is unaffected')).toBeDefined()
    const toggle = screen.getByRole('switch', { name: 'Show context injections' })
    expect(toggle.getAttribute('aria-checked')).toBe('true')

    fireEvent.click(toggle)
    expect(h.setShowContextInjections).toHaveBeenCalledWith(false)
    expect(toggle.getAttribute('aria-checked')).toBe('false')
  })
})
