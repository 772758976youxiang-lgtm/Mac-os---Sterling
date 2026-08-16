/** General Settings row for context-injection transcript visibility. */
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './ContextInjectionVisibilityRow.module.css'

/** Registration-side preference face. */
export interface ContextInjectionVisibilityRowInjected {
  hooks: {
    /** Persisted visibility preference bound as useShowContextInjections. */
    showContextInjections: SnapshotStore<boolean>
  }
  setShowContextInjections: (visible: boolean) => void
}

/** Full Settings-row props. */
export type ContextInjectionVisibilityRowProps =
  PropsRuntime<'settings.general.item'>
  & PropsLocale<'conversation'>
  & InjectFace<ContextInjectionVisibilityRowInjected>

/** Render the transcript context-row visibility switch. */
export function ContextInjectionVisibilityRow({
  useShowContextInjections, setShowContextInjections, t,
}: ContextInjectionVisibilityRowProps) {
  const visible = useShowContextInjections(value => value)
  return (
    <div className={css.row}>
      <div className={css.rowText}>
        <div id="show-context-injections-title" className={css.title}>
          {t('settings.contextInjection.title')}
        </div>
        <div className={css.desc}>{t('settings.contextInjection.description')}</div>
      </div>
      <button
        id="show-context-injections"
        className={css.toggle}
        type="button"
        role="switch"
        aria-checked={visible}
        aria-labelledby="show-context-injections-title"
        onClick={() => { setShowContextInjections(!visible) }}
      >
        <span className={css.toggleTrack} data-on={visible}>
          <span className={css.toggleThumb} />
        </span>
      </button>
    </div>
  )
}
