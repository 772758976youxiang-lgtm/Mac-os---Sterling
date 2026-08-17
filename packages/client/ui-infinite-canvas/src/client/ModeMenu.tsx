import { useState } from 'react'
import clsx from 'clsx'
import { Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MenuItem } from '@deepseek-ai/dsh-client-ui-primitives'
import type { CanvasMode } from './stores.ts'
import type { ModeMenuProps } from './contracts.ts'
import css from './ModeMenu.module.css'

/** Render the shared Harness/infinite-creation mode disclosure. */
export function ModeMenu({ wide, align = 'end', useStore, actions, t }: ModeMenuProps) {
  const mode = useStore(state => state.mode)
  const [open, setOpen] = useState(false)
  const items = [
    { id: 'harness', label: t('mode.harness') },
    { id: 'infinite', label: t('mode.infinite') },
  ] as const satisfies readonly MenuItem[]

  const choose = (next: CanvasMode): void => {
    actions.setMode(next)
    setOpen(false)
  }

  return (
    <Menu
      portal
      compact
      open={open}
      align={wide ? align : 'start'}
      ariaLabel={t('mode.menu')}
      anchor={(
        <button
          type="button"
          className={clsx(css.trigger, !wide && css.railTrigger)}
          aria-label={t('mode.button')}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => { setOpen(value => !value) }}
        >
          <span aria-hidden="true" className={css.glyph}>∞</span>
          {wide && <span className={css.label}>{t('mode.button')}</span>}
        </button>
      )}
      items={items}
      selectedId={mode}
      onSelect={(id) => { choose(id as CanvasMode) }}
      onClose={() => { setOpen(false) }}
      className={clsx(css.root)}
    />
  )
}

export type { ModeMenuProps } from './contracts.ts'
