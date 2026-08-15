import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import type { CanvasMode } from './stores.ts'
import type { ModeMenuProps } from './contracts.ts'
import css from './ModeMenu.module.css'

/** Render the shared Harness/infinite-creation mode disclosure. */
export function ModeMenu({ wide, align = 'end', useStore, actions, t }: ModeMenuProps) {
  const mode = useStore(state => state.mode)
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent): void => {
      if (root.current !== null && event.target instanceof Node && root.current.contains(event.target)) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const choose = (next: CanvasMode): void => {
    actions.setMode(next)
    setOpen(false)
  }

  return (
    <div ref={root} className={css.root}>
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
      {open && (
        <div className={css.menu} data-align={align} role="menu" aria-label={t('mode.menu')}>
          {(['harness', 'infinite'] as const).map(item => (
            <button
              key={item}
              type="button"
              role="menuitem"
              aria-checked={mode === item}
              className={clsx(css.item, mode === item && css.selected)}
              onClick={() => { choose(item) }}
            >
              <span className={css.check} aria-hidden="true">{mode === item ? '✓' : ''}</span>
              {t(item === 'harness' ? 'mode.harness' : 'mode.infinite')}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export type { ModeMenuProps } from './contracts.ts'
