// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { CompletionBanner } from '../src/client/skeleton/CompletionBanner.tsx'
import type { CompletionBannerProps } from '../src/client/skeleton/CompletionBanner.tsx'

afterEach(cleanup)

const SESSION = 'session-1' as SessionId

function createSessionsFixture(running: boolean) {
  let state = {
    ids: [SESSION],
    byId: {
      [SESSION]: { running },
    },
  }
  const listeners = new Set<() => void>()
  const useSessions = (selector => useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    () => selector(state as never),
  )) as CompletionBannerProps['useSessions']

  return {
    useSessions,
    setRunning(next: boolean) {
      state = {
        ...state,
        byId: { [SESSION]: { running: next } },
      }
      for (const listener of listeners) listener()
    },
  }
}

describe('CompletionBanner', () => {
  it('announces a live running-to-idle transition for two seconds', () => {
    vi.useFakeTimers()
    try {
      const fixture = createSessionsFixture(false)
      render(
        <CompletionBanner
          useSessions={fixture.useSessions}
          useWorkspaces={(() => { throw new Error('unused') }) as never}
          t={() => '任务已完成'}
        />,
      )

      expect(screen.queryByRole('alert')).toBeNull()

      act(() => { fixture.setRunning(true) })
      act(() => { fixture.setRunning(false) })

      expect(screen.getByRole('alert').textContent).toContain('任务已完成')
      act(() => { vi.advanceTimersByTime(1_999) })
      expect(screen.getByRole('alert')).toBeTruthy()
      act(() => { vi.advanceTimersByTime(1) })
      expect(screen.queryByRole('alert')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not announce an idle session merely because the overlay mounted', () => {
    const fixture = createSessionsFixture(false)
    render(
      <CompletionBanner
        useSessions={fixture.useSessions}
        useWorkspaces={(() => { throw new Error('unused') }) as never}
        t={() => '任务已完成'}
      />,
    )
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
