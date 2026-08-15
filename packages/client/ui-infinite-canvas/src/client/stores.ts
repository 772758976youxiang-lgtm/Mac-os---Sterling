import { defineStore } from '@deepseek-ai/dsh-client-runtime/client'

/** Canvas mode exposed by the top-level product switcher. */
export type CanvasMode = 'harness' | 'infinite'

/** JSON-compatible node record kept by the canvas document. */
export interface CanvasNodeRecord {
  id: string
  type?: string
  position: { x: number; y: number }
  data: { text: string }
}

/** JSON-compatible directed edge record kept by the canvas document. */
export interface CanvasEdgeRecord {
  id: string
  source: string
  target: string
}

/** Persisted canvas document. */
export interface CanvasDocument {
  nodes: CanvasNodeRecord[]
  edges: CanvasEdgeRecord[]
}

/** Root-scoped viewing state shared by the mode menu and canvas overlay. */
export interface CanvasState extends CanvasDocument {
  mode: CanvasMode
  loadedKey: string | undefined
  storageError: boolean
}

/** Store handle type shared by the brand menu and canvas overlay. */
export type CanvasStoreHandle = ReturnType<typeof createCanvasStore>

const EMPTY_DOCUMENT: CanvasDocument = { nodes: [], edges: [] }
const MAX_NODES = 500
const MAX_EDGES = 1000
const MAX_TEXT_LENGTH = 10000

/** Build the local-storage key for the most specific available navigation target. */
export function canvasStorageKey(sessionId: string | undefined, workspaceId: string | undefined): string {
  if (sessionId !== undefined && sessionId !== '') return `dsh.canvas.${sessionId}`
  if (workspaceId !== undefined && workspaceId !== '') return `dsh.canvas.${workspaceId}`
  return 'dsh.canvas.global'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseNode(value: unknown): CanvasNodeRecord | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || value.id === '') return undefined
  const position = value.position
  const data = value.data
  if (!isRecord(position) || typeof position.x !== 'number' || !Number.isFinite(position.x)
    || typeof position.y !== 'number' || !Number.isFinite(position.y)) return undefined
  if (!isRecord(data) || typeof data.text !== 'string' || data.text.length > MAX_TEXT_LENGTH) return undefined
  const type = value.type
  return {
    id: value.id,
    ...(typeof type === 'string' && type !== '' ? { type } : {}),
    position: { x: position.x, y: position.y },
    data: { text: data.text },
  }
}

function parseEdge(value: unknown): CanvasEdgeRecord | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || value.id === '') return undefined
  if (typeof value.source !== 'string' || value.source === '' || typeof value.target !== 'string' || value.target === '') return undefined
  return { id: value.id, source: value.source, target: value.target }
}

/** Parse and defensively limit a stored canvas document. */
export function parseCanvasDocument(raw: string | null): CanvasDocument {
  if (raw === null) return { ...EMPTY_DOCUMENT, nodes: [], edges: [] }
  try {
    const value: unknown = JSON.parse(raw)
    if (!isRecord(value) || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) return { ...EMPTY_DOCUMENT, nodes: [], edges: [] }
    const nodes = value.nodes.slice(0, MAX_NODES).map(parseNode)
    const edges = value.edges.slice(0, MAX_EDGES).map(parseEdge)
    if (nodes.some(node => node === undefined) || edges.some(edge => edge === undefined)) {
      return { ...EMPTY_DOCUMENT, nodes: [], edges: [] }
    }
    return {
      nodes: nodes as CanvasNodeRecord[],
      edges: edges as CanvasEdgeRecord[],
    }
  } catch {
    return { ...EMPTY_DOCUMENT, nodes: [], edges: [] }
  }
}

/** Read one canvas document without making browser storage a required capability. */
export function readCanvasDocument(key: string): CanvasDocument {
  if (typeof localStorage === 'undefined') return { ...EMPTY_DOCUMENT, nodes: [], edges: [] }
  try {
    return parseCanvasDocument(localStorage.getItem(key))
  } catch {
    return { ...EMPTY_DOCUMENT, nodes: [], edges: [] }
  }
}

/** Persist one canvas document; storage failures leave the in-memory editor usable. */
export function writeCanvasDocument(key: string, document: CanvasDocument): boolean {
  if (typeof localStorage === 'undefined') return false
  try {
    localStorage.setItem(key, JSON.stringify(document))
    return true
  } catch {
    return false
  }
}

/** Create the shared root-scoped store handle for the two canvas registrations. */
export function createCanvasStore() {
  return defineStore({
    init: (): CanvasState => ({
      mode: 'harness',
      nodes: [],
      edges: [],
      loadedKey: undefined,
      storageError: false,
    }),
    actions: {
      setMode: (draft, mode: CanvasMode) => { draft.mode = mode },
      addTextNode: (draft, id: string, position: { x: number; y: number }, text = '新文本') => {
        draft.nodes.push({ id, type: 'text', position, data: { text } })
      },
      updateNodeText: (draft, id: string, text: string) => {
        const node = draft.nodes.find(candidate => candidate.id === id)
        if (node !== undefined) node.data.text = text.slice(0, MAX_TEXT_LENGTH)
      },
      replaceNodes: (draft, nodes: CanvasNodeRecord[]) => { draft.nodes = nodes },
      replaceEdges: (draft, edges: CanvasEdgeRecord[]) => { draft.edges = edges },
      removeNodes: (draft, ids: string[]) => {
        const selected = new Set(ids)
        draft.nodes = draft.nodes.filter(node => !selected.has(node.id))
        draft.edges = draft.edges.filter(edge => !selected.has(edge.source) && !selected.has(edge.target))
      },
      loadDocument: (draft, key: string, document: CanvasDocument) => {
        draft.loadedKey = key
        draft.nodes = document.nodes
        draft.edges = document.edges
        draft.storageError = false
      },
      setStorageError: (draft, failed: boolean) => { draft.storageError = failed },
    },
  })
}
