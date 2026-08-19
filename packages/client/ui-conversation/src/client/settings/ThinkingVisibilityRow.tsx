/** General Settings row for assistant-reasoning transcript visibility. */
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './ContextInjectionVisibilityRow.module.css'

/** Registration-side preference face. */
export interface ThinkingVisibilityRowInjected {
  hooks: {
    /** Persisted visibility preference bound as useShowThinking. */
    showThinking: SnapshotStore<boolean>
  }
  setShowThinking: (visible: boolean) => void
}

/** Full Settings-row props. */
export type ThinkingVisibilityRowProps =
  PropsRuntime<'settings.general.item'>
  & PropsLocale<'conversation'>
  & InjectFace<ThinkingVisibilityRowInjected>

/** Render the transcript reasoning-visibility switch. */
export function ThinkingVisibilityRow({
  useShowThinking, setShowThinking, t,
}: ThinkingVisibilityRowProps) {
  const visible = useShowThinking(value => value)
  return (
    <div className={css.row}>
      <div className={css.rowText}>
        <div id="show-thinking-title" className={css.title}>
          {t('settings.thinking.title')}
        </div>
        <div className={css.desc}>{t('settings.thinking.description')}</div>
      </div>
      <button
        id="show-thinking"
        className={css.toggle}
        type="button"
        role="switch"
        aria-checked={visible}
        aria-labelledby="show-thinking-title"
        onClick={() => { setShowThinking(!visible) }}
      >
        <span className={css.toggleTrack} data-on={visible}>
          <span className={css.toggleThumb} />
        </span>
      </button>
    </div>
  )
}
