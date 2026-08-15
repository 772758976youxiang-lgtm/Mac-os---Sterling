// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  canvasStorageKey,
  createCanvasStore,
  parseCanvasDocument,
  type CanvasDocument,
} from '../src/client/stores.ts'

const EMPTY: CanvasDocument = { nodes: [], edges: [] }

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('infinite canvas store', () => {
  it('starts in Harness mode with an empty document', () => {
    const state = createCanvasStore().create().getSnapshot()
    expect(state.mode).toBe('harness')
    expect(state.nodes).toEqual([])
    expect(state.edges).toEqual([])
  })

  it('changes mode and mutates text nodes and edges through actions', () => {
    const instance = createCanvasStore().create()
    instance.actions.setMode('infinite')
    instance.actions.addTextNode('note-1', { x: 10, y: 20 }, 'Hello')
    instance.actions.updateNodeText('note-1', 'Updated')
    instance.actions.replaceEdges([{ id: 'e-1', source: 'note-1', target: 'note-2' }])
    instance.actions.removeNodes(['note-1'])

    expect(instance.getSnapshot()).toMatchObject({ mode: 'infinite', nodes: [], edges: [] })
  })

  it('loads valid documents and falls back to empty for invalid storage', () => {
    localStorage.setItem('dsh.canvas.session-a', JSON.stringify({
      nodes: [{ id: 'n', position: { x: 1, y: 2 }, data: { text: 'ok' } }],
      edges: [],
    }))
    expect(parseCanvasDocument(localStorage.getItem('dsh.canvas.session-a'))).toEqual({
      nodes: [{ id: 'n', position: { x: 1, y: 2 }, data: { text: 'ok' } }],
      edges: [],
    })
    expect(parseCanvasDocument('{"nodes":[{"id":1}],"edges":[]}')).toEqual(EMPTY)
    expect(parseCanvasDocument('not-json')).toEqual(EMPTY)
  })

  it('derives stable keys from session, workspace, and global fallback', () => {
    expect(canvasStorageKey('session-a', 'workspace-a')).toBe('dsh.canvas.session-a')
    expect(canvasStorageKey(undefined, 'workspace-a')).toBe('dsh.canvas.workspace-a')
    expect(canvasStorageKey(undefined, undefined)).toBe('dsh.canvas.global')
  })
})
