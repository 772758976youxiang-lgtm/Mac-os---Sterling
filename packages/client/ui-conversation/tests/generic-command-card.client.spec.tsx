// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { GenericCommandCard } from '../src/client/chat/GenericCommandCard.tsx'
import type { GenericCommandCardProps } from '../src/client/chat/GenericCommandCard.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const t = makeTranslate(zh, commonZh)

function command(name: string, text: string): GenericCommandCardProps['node'] {
  return { name, outcome: { kind: 'success', text } } as never
}

describe('GenericCommandCard', () => {
  it('localizes the /permission settlement with the preset labels', () => {
    render(<GenericCommandCard node={command('permission', 'preset workspace-write')} t={t} />)
    expect(screen.getByText('权限')).toBeTruthy()
    expect(screen.getByText('预设 工作区写入')).toBeTruthy()
  })

  it('localizes the /permission current and unknown settlements', () => {
    render(<GenericCommandCard node={command('permission', 'current preset read-only (available: read-only, workspace-write, danger-full-access)')} t={t} />)
    expect(screen.getByText('当前预设 只读（可用：只读、工作区写入、完全访问）')).toBeTruthy()

    cleanup()
    render(<GenericCommandCard node={command('permission', 'unknown preset "nope" (available: read-only, workspace-write, danger-full-access)')} t={t} />)
    expect(screen.getByText('未知预设 "nope"（可用：只读、工作区写入、完全访问）')).toBeTruthy()
  })

  it('leaves non-permission command settlements untouched', () => {
    render(<GenericCommandCard node={command('compact', 'compacted 3 history items')} t={t} />)
    expect(screen.getByText('compacted 3 history items')).toBeTruthy()
  })
})
