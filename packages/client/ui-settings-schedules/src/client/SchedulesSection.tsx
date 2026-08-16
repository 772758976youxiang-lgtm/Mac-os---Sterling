/** Scheduled-task settings page with create, edit, and delete workflows. */

import { useEffect, useMemo, useState } from 'react'
import type { IApiClient, ScheduleRuleView, ScheduledTaskView } from '@deepseek-ai/dsh-api-remotes/client'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-web-react'
import {
  Button, IconEditOutline16, IconListPenOutline16, IconPlusOutline16,
  IconRefreshOutline16, IconTrashOutline16, Modal, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { SchedulesKey } from './locales.ts'
import type { SchedulesState, SchedulesStore } from './store.ts'
import css from './SchedulesSection.module.css'

type Translate = (key: SchedulesKey) => string

/** Registration-side dependencies for the settings section. */
export interface SchedulesSectionInjected {
  controller: SchedulesStore
  useSnapshot: SnapshotSelectorHook<SchedulesState>
  api: Pick<IApiClient, 'schedules'>
  t: Translate
}

/** Props bound by the settings slot outlet. */
export type SchedulesSectionProps =
  PropsRuntime<'settings.section'>
  & InjectFace<SchedulesSectionInjected>

type IntervalUnit = 'minutes' | 'hours' | 'days' | 'weeks'
type TimingMode = 'once' | 'recurring'

interface TaskDraft {
  sessionId: string
  prompt: string
  mode: TimingMode
  at: string
  interval: string
  unit: IntervalUnit
}

const UNIT_SECONDS: Record<IntervalUnit, number> = {
  minutes: 60,
  hours: 3_600,
  days: 86_400,
  weeks: 604_800,
}

/** Replace named product-copy tokens without introducing a formatting dependency. */
function copy(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((text, [key, value]) => text.replace(`{${key}}`, value), template)
}

/** Format one absolute instant for a datetime-local control. */
function localInputValue(instant: string): string {
  const date = new Date(instant)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

/** Default a new one-shot task to the next whole hour. */
function defaultRunAt(): string {
  const date = new Date(Date.now() + 60 * 60_000)
  date.setMinutes(0, 0, 0)
  return localInputValue(date.toISOString())
}

/** Prefer the largest integral unit for an existing recurring interval. */
function intervalFields(seconds: number): { interval: string; unit: IntervalUnit } {
  for (const unit of ['weeks', 'days', 'hours', 'minutes'] as const) {
    if (seconds % UNIT_SECONDS[unit] === 0) return { interval: String(seconds / UNIT_SECONDS[unit]), unit }
  }
  return { interval: String(Math.ceil(seconds / 60)), unit: 'minutes' }
}

/** Seed the editor from either a task or new-task defaults. */
function draftFor(task: ScheduledTaskView | undefined, sessionId: string): TaskDraft {
  if (task === undefined) {
    return { sessionId, prompt: '', mode: 'once', at: defaultRunAt(), interval: '1', unit: 'days' }
  }
  const recurring = task.kind === 'every' ? intervalFields(task.everySeconds) : undefined
  return {
    sessionId: task.sessionId,
    prompt: task.prompt,
    mode: recurring === undefined ? 'once' : 'recurring',
    at: localInputValue(task.scheduledAt),
    interval: recurring?.interval ?? '1',
    unit: recurring?.unit ?? 'days',
  }
}

/** Convert a validated editor draft to the API rule. */
function ruleFor(draft: TaskDraft): ScheduleRuleView {
  if (draft.mode === 'once') return { prompt: draft.prompt.trim(), at: new Date(draft.at).toISOString() }
  return {
    prompt: draft.prompt.trim(),
    everySeconds: Number(draft.interval) * UNIT_SECONDS[draft.unit],
  }
}

/** Validate fields locally so recoverable errors stay beside the editor. */
function validateDraft(draft: TaskDraft, t: Translate): string | undefined {
  if (draft.prompt.trim().length === 0) return t('promptRequired')
  if (draft.sessionId === '') return t('sessionRequired')
  if (draft.mode === 'once') {
    const at = Date.parse(draft.at)
    if (!Number.isFinite(at) || at <= Date.now()) return t('futureRequired')
    return undefined
  }
  const seconds = Number(draft.interval) * UNIT_SECONDS[draft.unit]
  if (!Number.isSafeInteger(seconds) || seconds < 300) return t('intervalInvalid')
  return undefined
}

/** Compact recurrence copy for one row. */
function cadence(task: ScheduledTaskView, t: Translate): string {
  if (task.kind !== 'every') return t('oneTime')
  const fields = intervalFields(task.everySeconds)
  return copy(t('every'), { value: fields.interval, unit: t(fields.unit) })
}

/** Create/edit modal shared by both flows. */
function TaskEditor({ task, ownerIds, currentId, sessionTitle, busy, t, onClose, onSave }: {
  task: ScheduledTaskView | undefined
  ownerIds: readonly string[]
  currentId: string | undefined
  sessionTitle: (id: string) => string
  busy: boolean
  t: Translate
  onClose: () => void
  onSave: (draft: TaskDraft) => Promise<string | undefined>
}) {
  const initialSession = task?.sessionId
    ?? (currentId !== undefined && ownerIds.includes(currentId) ? currentId : ownerIds[0] ?? '')
  const [draft, setDraft] = useState(() => draftFor(task, initialSession))
  const [error, setError] = useState<string>()
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const editing = task !== undefined
  const sessions = editing && !ownerIds.includes(task.sessionId)
    ? [task.sessionId, ...ownerIds]
    : ownerIds

  const submit = async () => {
    const invalid = validateDraft(draft, t)
    if (invalid !== undefined) {
      setError(invalid)
      return
    }
    const failure = await onSave(draft)
    if (failure === undefined) onClose()
    else setError(failure || t('saveError'))
  }

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title={editing ? t('editTitle') : t('createTitle')}
      closeLabel={t('close')}
      className={css['editorDialog'] ?? ''}
      footer={(
        <>
          <Button variant="ghost" disabled={busy} onClick={onClose}>{t('cancel')}</Button>
          <Button variant="primary" disabled={busy} onClick={() => { void submit() }}>
            {busy ? t('saving') : t('save')}
          </Button>
        </>
      )}
    >
      <form className={css.form} onSubmit={(event) => { event.preventDefault(); void submit() }}>
        <label className={css.field}>
          <span className={css.label}>{t('prompt')}</span>
          <textarea
            autoFocus
            rows={4}
            value={draft.prompt}
            placeholder={t('promptPlaceholder')}
            onChange={(event) => { setDraft({ ...draft, prompt: event.target.value }); setError(undefined) }}
          />
        </label>
        <label className={css.field}>
          <span className={css.label}>{t('session')}</span>
          <select
            value={draft.sessionId}
            disabled={editing}
            onChange={(event) => { setDraft({ ...draft, sessionId: event.target.value }); setError(undefined) }}
          >
            {sessions.map(id => (
              <option key={id} value={id}>
                {sessionTitle(id)}{id === currentId ? ` · ${t('currentSession')}` : ''}
              </option>
            ))}
          </select>
        </label>
        <fieldset className={css.fieldset}>
          <legend className={css.label}>{t('timing')}</legend>
          <div className={css.segmented}>
            {(['once', 'recurring'] as const).map(mode => (
              <button
                key={mode}
                type="button"
                data-active={draft.mode === mode ? 'true' : undefined}
                onClick={() => { setDraft({ ...draft, mode }); setError(undefined) }}
              >
                {t(mode)}
              </button>
            ))}
          </div>
        </fieldset>
        {draft.mode === 'once' ? (
          <label className={css.field}>
            <span className={css.label}>{t('runAt')}</span>
            <input
              type="datetime-local"
              step="60"
              value={draft.at}
              onChange={(event) => { setDraft({ ...draft, at: event.target.value }); setError(undefined) }}
            />
            <span className={css.hint}>{copy(t('localZone'), { zone })}</span>
          </label>
        ) : (
          <label className={css.field}>
            <span className={css.label}>{t('interval')}</span>
            <span className={css.intervalControl}>
              <input
                type="number"
                min="1"
                step="1"
                value={draft.interval}
                onChange={(event) => { setDraft({ ...draft, interval: event.target.value }); setError(undefined) }}
              />
              <select
                value={draft.unit}
                onChange={(event) => {
                  setDraft({ ...draft, unit: event.target.value as IntervalUnit })
                  setError(undefined)
                }}
              >
                {(['minutes', 'hours', 'days', 'weeks'] as const).map(unit => (
                  <option key={unit} value={unit}>{t(unit)}</option>
                ))}
              </select>
            </span>
          </label>
        )}
        {error !== undefined && <p className={css.formError} role="alert">{error}</p>}
      </form>
    </Modal>
  )
}

/** Render the scheduled-task settings page. */
export function SchedulesSection(props: Partial<SchedulesSectionProps>) {
  const { controller, useSnapshot, useSessions, t } = props
  if (controller === undefined || useSnapshot === undefined || useSessions === undefined || t === undefined) return null
  const state = useSnapshot(value => value)
  const sessions = useSessions(value => value)
  const [editor, setEditor] = useState<{ key: string; task?: ScheduledTaskView }>()
  const [deleteTarget, setDeleteTarget] = useState<ScheduledTaskView>()
  const [deleteError, setDeleteError] = useState<string>()

  useEffect(() => {
    if (controller.store.getSnapshot().status === 'idle') void controller.load()
  }, [controller])

  const titleOf = (id: string) => sessions.byId[id as never]?.displayTitle ?? t('unknownSession')
  const dateTime = useMemo(() => new Intl.DateTimeFormat(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }), [])

  const deleteTask = async () => {
    if (deleteTarget === undefined) return
    const failure = await controller.delete(deleteTarget)
    if (failure === undefined) {
      setDeleteTarget(undefined)
      setDeleteError(undefined)
    } else setDeleteError(failure || t('deleteError'))
  }

  return (
    <section className={css.section}>
      <div className={css.headingRow}>
        <div>
          <h2>{t('title')}</h2>
          <p>{t('intro')}</p>
        </div>
      </div>

      {state.status === 'loading' && state.items.length === 0 && (
        <p className={css.status} role="status">{t('loading')}</p>
      )}
      {state.status === 'error' && state.items.length === 0 && (
        <div className={css.errorState} role="alert">
          <strong>{t('loadError')}</strong>
          <span>{state.error}</span>
          <Button size="sm" variant="outline" onClick={() => { void controller.load() }}>{t('retry')}</Button>
        </div>
      )}
      {state.status === 'ready' && state.items.length === 0 && (
        <div className={css.empty}>
          <span className={css.emptyIcon}><IconListPenOutline16 size={20} /></span>
          <strong>{t('emptyTitle')}</strong>
          <p>{t('emptyBody')}</p>
        </div>
      )}
      {state.items.length > 0 && (
        <ul className={css.list}>
          {state.items.map(task => (
            <li key={`${task.sessionId}:${task.id}`} className={css.row}>
              <div className={css.rowMain}>
                <div className={css.taskLine}>
                  <span className={css.prompt}>{task.prompt}</span>
                  <span className={css.state} data-overdue={task.state === 'overdue' ? 'true' : undefined}>
                    {t(task.state)}
                  </span>
                </div>
                <div className={css.meta}>
                  <span>{titleOf(task.sessionId)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{cadence(task, t)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{copy(t('nextRun'), { time: dateTime.format(new Date(task.scheduledAt)) })}</span>
                </div>
              </div>
              <div className={css.rowActions}>
                <Tooltip label={t('edit')} side="bottom">
                  <button
                    type="button"
                    className={css.iconButton}
                    aria-label={t('edit')}
                    onClick={() => { setEditor({ key: task.id, task }) }}
                  >
                    <IconEditOutline16 size={15} />
                  </button>
                </Tooltip>
                <Tooltip label={t('remove')} side="bottom">
                  <button
                    type="button"
                    className={css.iconButton}
                    aria-label={t('remove')}
                    onClick={() => { setDeleteError(undefined); setDeleteTarget(task) }}
                  >
                    <IconTrashOutline16 size={15} />
                  </button>
                </Tooltip>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className={css.actionDock}>
        <Tooltip label={t('refresh')} side="top">
          <button
            type="button"
            className={css.iconButton}
            aria-label={t('refresh')}
            disabled={state.status === 'loading'}
            onClick={() => { void controller.load() }}
          >
            <IconRefreshOutline16 size={16} />
          </button>
        </Tooltip>
        <Button
          variant="primary"
          size="sm"
          icon={<IconPlusOutline16 size={14} />}
          disabled={state.ownerSessionIds.length === 0}
          onClick={() => { setEditor({ key: `new-${Date.now()}` }) }}
        >
          {t('create')}
        </Button>
      </div>

      {editor !== undefined && (
        <TaskEditor
          key={editor.key}
          task={editor.task}
          ownerIds={state.ownerSessionIds}
          currentId={sessions.current}
          sessionTitle={titleOf}
          busy={state.busy}
          t={t}
          onClose={() => { if (!state.busy) setEditor(undefined) }}
          onSave={async draft => editor.task === undefined
            ? controller.create(draft.sessionId, ruleFor(draft))
            : controller.update(editor.task, ruleFor(draft))}
        />
      )}

      <Modal
        open={deleteTarget !== undefined}
        onClose={() => { if (!state.busy) setDeleteTarget(undefined) }}
        title={t('deleteTitle')}
        description={t('deleteBody')}
        closeLabel={t('close')}
        footer={(
          <>
            <Button variant="ghost" disabled={state.busy} onClick={() => { setDeleteTarget(undefined) }}>
              {t('cancel')}
            </Button>
            <Button variant="primary" disabled={state.busy} onClick={() => { void deleteTask() }}>
              {state.busy ? t('deleting') : t('deleteConfirm')}
            </Button>
          </>
        )}
      >
        {deleteError !== undefined && <p className={css.formError} role="alert">{deleteError}</p>}
      </Modal>
    </section>
  )
}
