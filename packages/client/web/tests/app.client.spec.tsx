// @vitest-environment jsdom
/**
 * buildRenderApp on SlotTestRuntime: the fail-loud sessions precondition and
 * the one ctx-level renderSlot('root') call over the real slot stack.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { Context } from '@deepseek-ai/cordis'
import { SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime'
import { buildRenderApp } from '@deepseek-ai/dsh-client-web/src/app.tsx'

let runtime: SlotTestRuntime | undefined

afterEach(async () => {
  cleanup()
  await runtime?.dispose()
  runtime = undefined
  document.title = ''
})

async function bench() {
  runtime = await SlotTestRuntime.create()
  await runtime.root.declare({}, () => <div data-testid="frame" />)
  return { runtime, renderApp: buildRenderApp({ ctx: runtime.ctx }) }
}

describe('buildRenderApp', () => {
  it('fails loud when the sessions service is unavailable', () => {
    expect(() => buildRenderApp({ ctx: new Context() })).toThrow('sessions service unavailable')
  })

  it('renders the root slot tree through the one ctx-level renderSlot call', async () => {
    const b = await bench()
    const view = render(<>{b.renderApp()}</>)
    expect(view.getByTestId('frame')).toBeTruthy()
  })

  it('never projects a session title into the OS window title', async () => {
    document.title = 'Product'
    const b = await bench()
    render(<>{b.renderApp()}</>)
    expect(document.title).toBe('Product')
    await b.runtime.sessions.add({ id: 's1', summary: { title: 'First' } })
    expect(document.title).toBe('Product')
    await b.runtime.sessions.setCurrent(undefined)
    expect(document.title).toBe('Product')
  })
})
