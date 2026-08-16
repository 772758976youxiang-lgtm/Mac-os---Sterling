// @vitest-environment jsdom
/** Scheduled-task settings workflows over a controlled page snapshot. */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { ScheduledTaskView } from '@deepseek-ai/dsh-api-remotes/client'
import { SchedulesSection } from '../src/client/SchedulesSection.tsx'
import type { SchedulesSectionProps } from '../src/client/SchedulesSection.tsx'
import { en } from '../src/client/locales.ts'
import type { SchedulesState } from '../src/client/store.ts'

afterEach(cleanup)

const TASK: ScheduledTaskView = {
  sessionId: 'session-a' as never,
  id: 'schedule-a',
  prompt: 'Review open work',
  scheduledAt: '2026-08-17T01:00:00.000Z',
  state: 'scheduled',
  deliveryMode: 'session-local',
  kind: 'every',
  everySeconds: 86_400,
}

const t = (key: keyof typeof en) => en[key]

function mount(items: readonly ScheduledTaskView[] = [TASK]) {
  const state = createSnapshotStore<SchedulesState>({
    status: 'ready', error: null, ownerSessionIds: ['session-a'], items, busy: false,
  })
  const controller = {
    store: state,
    load: vi.fn(() => Promise.resolve()),
    create: vi.fn(() => Promise.resolve(undefined)),
    update: vi.fn(() => Promise.resolve(undefined)),
    delete: vi.fn(() => Promise.resolve(undefined)),
  }
  const props = {
    controller,
    useSnapshot: bindSnapshotSelector(state),
    useSessions: (selector: (value: unknown) => unknown) => selector({
      current: 'session-a',
      byId: { 'session-a': { displayTitle: 'Current project' } },
    }),
    t,
  } as unknown as SchedulesSectionProps
  render(<SchedulesSection {...props} />)
  return controller
}

describe('SchedulesSection', () => {
  it('renders the directory and recurrence metadata', () => {
    mount()

    expect(screen.getByRole('heading', { name: en.title })).toBeTruthy()
    expect(screen.getByText(TASK.prompt)).toBeTruthy()
    expect(screen.getByText('Current project')).toBeTruthy()
    expect(screen.getByText('Every 1 Days')).toBeTruthy()
  })

  it('shows an actionable empty state', () => {
    mount([])

    expect(screen.getByText(en.emptyTitle)).toBeTruthy()
    expect(screen.getByRole('button', { name: en.create })).toBeTruthy()
  })

  it('creates a one-time task for the selected session', async () => {
    const controller = mount([])
    fireEvent.click(screen.getByRole('button', { name: en.create }))
    fireEvent.change(screen.getByLabelText(en.prompt), { target: { value: 'Prepare a status note' } })
    fireEvent.click(screen.getByRole('button', { name: en.save }))

    await waitFor(() => { expect(controller.create).toHaveBeenCalledOnce() })
    expect(controller.create).toHaveBeenCalledWith(
      'session-a', expect.objectContaining({ prompt: 'Prepare a status note' }),
    )
    expect(screen.queryByRole('dialog', { name: en.createTitle })).toBeNull()
  })

  it('edits an existing task without changing its owner', async () => {
    const controller = mount()
    fireEvent.click(screen.getByRole('button', { name: en.edit }))
    const prompt = screen.getByLabelText(en.prompt)
    fireEvent.change(prompt, { target: { value: 'Review the updated work' } })
    fireEvent.click(screen.getByRole('button', { name: en.save }))

    await waitFor(() => { expect(controller.update).toHaveBeenCalledOnce() })
    expect(controller.update).toHaveBeenCalledWith(TASK, expect.objectContaining({
      prompt: 'Review the updated work', everySeconds: 86_400,
    }))
  })

  it('validates recurring intervals before writing', async () => {
    const controller = mount([])
    fireEvent.click(screen.getByRole('button', { name: en.create }))
    fireEvent.change(screen.getByLabelText(en.prompt), { target: { value: 'Too frequent' } })
    fireEvent.click(screen.getByRole('button', { name: en.recurring }))
    fireEvent.change(screen.getByLabelText(en.interval), { target: { value: '1' } })
    fireEvent.change(screen.getAllByRole('combobox').at(-1)!, { target: { value: 'minutes' } })
    fireEvent.click(screen.getByRole('button', { name: en.save }))

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', en.intervalInvalid)
    expect(controller.create).not.toHaveBeenCalled()
  })

  it('requires confirmation before deleting', async () => {
    const controller = mount()
    fireEvent.click(screen.getByRole('button', { name: en.remove }))
    expect(screen.getByRole('dialog', { name: en.deleteTitle })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.deleteConfirm }))

    await waitFor(() => { expect(controller.delete).toHaveBeenCalledWith(TASK) })
  })
})
