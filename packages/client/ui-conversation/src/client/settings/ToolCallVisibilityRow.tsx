/** General Settings row for tool-call transcript visibility. */
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './ContextInjectionVisibilityRow.module.css'

/** Registration-side preference face. */
export interface ToolCallVisibilityRowInjected {
  hooks: {
    /** Persisted visibility preference bound as useShowToolCalls. */
    showToolCalls: SnapshotStore<boolean>
  }
  setShowToolCalls: (visible: boolean) => void
}

/** Full Settings-row props. */
export type ToolCallVisibilityRowProps =
  PropsRuntime<'settings.general.item'>
  & PropsLocale<'conversation'>
  & InjectFace<ToolCallVisibilityRowInjected>

/** Render the transcript tool-call visibility switch. */
export function ToolCallVisibilityRow({
  useShowToolCalls, setShowToolCalls, t,
}: ToolCallVisibilityRowProps) {
  const visible = useShowToolCalls(value => value)
  return (
    <div className={css.row}>
      <div className={css.rowText}>
        <div id="show-tool-calls-title" className={css.title}>
          {t('settings.toolCalls.title')}
        </div>
        <div className={css.desc}>{t('settings.toolCalls.description')}</div>
      </div>
      <button
        id="show-tool-calls"
        className={css.toggle}
        type="button"
        role="switch"
        aria-checked={visible}
        aria-labelledby="show-tool-calls-title"
        onClick={() => { setShowToolCalls(!visible) }}
      >
        <span className={css.toggleTrack} data-on={visible}>
          <span className={css.toggleThumb} />
        </span>
      </button>
    </div>
  )
}
