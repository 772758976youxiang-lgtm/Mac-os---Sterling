/** Frame-wide task completion announcement. */

import { useEffect, useRef, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import css from './CompletionBanner.module.css'

/** Root-overlay props supplied by the slot renderer. */
export type CompletionBannerProps = PropsRuntime<'shell.overlay'> & PropsLocale<'conversation'>

const LIFETIME_MS = 2_000

/**
 * Announces a live session's running-to-idle edge without replaying historical idle sessions.
 * @param props - Framework session-list reader and conversation locale translator.
 * @returns the current completion announcement, if any.
 */
export function CompletionBanner({ useSessions, t }: CompletionBannerProps) {
  const sessions = useSessions(snapshot => snapshot)
  const observed = useRef<Map<SessionId, boolean> | null>(null)
  const [sequence, setSequence] = useState<number | null>(null)

  useEffect(() => {
    const next = new Map<SessionId, boolean>()
    let completed = false
    for (const id of sessions.ids) {
      const running = sessions.byId[id]?.running ?? false
      const previous = observed.current?.get(id)
      if (previous === true && !running) completed = true
      next.set(id, running)
    }
    observed.current = next
    if (completed) setSequence(current => (current ?? 0) + 1)
  }, [sessions])

  useEffect(() => {
    if (sequence === null) return
    const timer = setTimeout(() => { setSequence(null) }, LIFETIME_MS)
    return () => { clearTimeout(timer) }
  }, [sequence])

  if (sequence === null) return null
  return (
    <div className={css.banner} role="alert">
      <span className={css.icon} aria-hidden>✓</span>
      <span>{t('notification.completed')}</span>
    </div>
  )
}
