// @vitest-environment jsdom
import { useSyncExternalStore } from 'react'
import type * as React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { createCanvasStore } from '../src/client/stores.ts'
import { ModeMenu } from '../src/client/ModeMenu.tsx'
import type { ModeMenuProps } from '../src/client/ModeMenu.tsx'

const copy: Record<string, string> = {
  'mode.button': '模式',
  'mode.menu': '选择模式',
  'mode.harness': 'Harness 模式',
  'mode.infinite': '无限创作模式',
}

function renderMenu(align?: 'start' | 'end', wide = true): ReturnType<typeof render> {
  const instance = createCanvasStore().create()
  function Harness(): React.JSX.Element {
    const subscribe = (listener: () => void): (() => void) => instance.subscribe(listener)
    const getSnapshot = (): ReturnType<typeof instance.getSnapshot> => instance.getSnapshot()
    const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
    const props = {
      wide,
      align,
      useStore: <S,>(select: (state: typeof snapshot) => S): S => select(snapshot),
      actions: instance.actions,
      t: (key: string) => copy[key] ?? key,
    } as ModeMenuProps
    return <ModeMenu {...props} />
  }
  return render(<Harness />)
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('ModeMenu', () => {
  it('opens the menu and selects Infinite creation mode', () => {
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: '模式' }))
    expect(screen.getByRole('menu', { name: '选择模式' })).toBeTruthy()
    fireEvent.click(screen.getByRole('menuitem', { name: '无限创作模式' }))
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('closes on Escape and marks the active mode', () => {
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: '模式' }))
    expect(screen.getByRole('menuitem', { name: 'Harness 模式' }).querySelector('svg')).not.toBeNull()
    expect(screen.getByRole('menuitem', { name: '无限创作模式' }).querySelector('svg')).toBeNull()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('exposes start alignment for the canvas header placement', () => {
    renderMenu('start')
    fireEvent.click(screen.getByRole('button', { name: '模式' }))

    expect(screen.getByRole('menu', { name: '选择模式' }).getAttribute('data-align')).toBe('start')
  })

  it('opens toward the page from the collapsed left rail', () => {
    renderMenu(undefined, false)
    fireEvent.click(screen.getByRole('button', { name: '模式' }))

    expect(screen.getByRole('menu', { name: '选择模式' }).getAttribute('data-align')).toBe('start')
  })

  it('portals the collapsed-rail menu outside its clipping host', () => {
    const view = renderMenu(undefined, false)
    fireEvent.click(screen.getByRole('button', { name: '模式' }))
    const menu = screen.getByRole('menu', { name: '选择模式' })

    expect(view.container.contains(menu)).toBe(false)
    expect(menu.parentElement).toBe(document.body)
  })
})
