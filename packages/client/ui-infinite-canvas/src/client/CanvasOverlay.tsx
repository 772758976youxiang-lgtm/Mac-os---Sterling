import { useEffect, useMemo } from 'react'
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  useReactFlow,
} from '@xyflow/react'
import type { Connection, Edge, EdgeChange, Node, NodeChange, NodeProps } from '@xyflow/react'
import { ModeMenu } from './ModeMenu.tsx'
import type { CanvasOverlayProps } from './contracts.ts'
import { nextCanvasNodePosition } from './placement.ts'
import {
  canvasStorageKey,
  readCanvasDocument,
  writeCanvasDocument,
} from './stores.ts'
import css from './CanvasOverlay.module.css'

type FlowNode = Node<{ text: string }, 'text'>

function EditableTextNode(props: NodeProps<FlowNode> & { label: string; onTextChange: (id: string, text: string) => void }) {
  return (
    <div className={css.node} data-selected={props.selected || undefined}>
      <Handle type="target" position={Position.Top} />
      <div className={css.nodeDragHandle} data-node-drag-handle>
        <span aria-hidden="true">⠿</span>
        <span>{props.label}</span>
      </div>
      <textarea
        className="nodrag nopan"
        aria-label={props.label}
        value={props.data.text}
        onChange={(event) => { props.onTextChange(props.id, event.currentTarget.value) }}
        onKeyDown={(event) => { event.stopPropagation() }}
        rows={3}
      />
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

function CanvasToolbar(props: { addTextAt: (position: { x: number; y: number }) => void; label: string }) {
  const flow = useReactFlow<FlowNode>()
  return (
    <div className={css.toolbar}>
      <button
        type="button"
        className={css.toolbarButton}
        onClick={() => {
          const point = flow.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
          props.addTextAt(point)
        }}
      >
        + {props.label}
      </button>
    </div>
  )
}

/** Full-frame xyflow surface shown while Infinite creation mode is selected. */
export function CanvasOverlay({ useStore, actions, t, useSessions, useWorkspaces }: CanvasOverlayProps) {
  const mode = useStore(state => state.mode)
  const nodes = useStore(state => state.nodes)
  const edges = useStore(state => state.edges)
  const loadedKey = useStore(state => state.loadedKey)
  const storageError = useStore(state => state.storageError)
  const sessionId = useSessions(state => state.current)
  const workspaceId = useWorkspaces(state => state.recentWorkspaceId)
  const storageKey = canvasStorageKey(sessionId, workspaceId)

  useEffect(() => {
    actions.loadDocument(storageKey, readCanvasDocument(storageKey))
  }, [actions, storageKey])

  useEffect(() => {
    if (loadedKey !== storageKey) return
    actions.setStorageError(!writeCanvasDocument(storageKey, { nodes, edges }))
  }, [actions, edges, loadedKey, nodes, storageKey])

  const flowNodes = nodes.map(node => ({
    ...node,
    dragHandle: `.${css.nodeDragHandle}`,
  })) as FlowNode[]
  const flowEdges = edges as Edge[]
  const nodeTypes = useMemo(() => ({
    text: (props: NodeProps<FlowNode>) => (
      <EditableTextNode {...props} label={t('canvas.nodeLabel')} onTextChange={actions.updateNodeText} />
    ),
  }), [actions.updateNodeText, t])

  if (mode !== 'infinite') return null

  const replaceNodes = (changes: NodeChange<FlowNode>[]): void => {
    actions.replaceNodes(applyNodeChanges(changes, flowNodes))
  }
  const replaceEdges = (changes: EdgeChange[]): void => {
    actions.replaceEdges(applyEdgeChanges(changes, flowEdges))
  }
  const connect = (connection: Connection): void => {
    actions.replaceEdges(addEdge(connection, flowEdges))
  }
  const addTextAt = (position: { x: number; y: number }): void => {
    actions.addTextNode(
      `text-${Date.now()}-${nodes.length}`,
      nextCanvasNodePosition(position, nodes),
      t('canvas.newText'),
    )
  }

  return (
    <div className={css.overlay} data-infinite-canvas>
      <div className={css.header}>
        <ModeMenu wide align="start" useStore={useStore} actions={actions} t={t} />
        <span className={css.title}>{t('mode.infinite')}</span>
      </div>
      <div className={css.canvas} aria-label={t('canvas.aria')}>
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          onNodesChange={replaceNodes}
          onEdgesChange={replaceEdges}
          onConnect={connect}
          onNodesDelete={(deleted) => { actions.removeNodes(deleted.map(node => node.id)) }}
          deleteKeyCode="Delete"
          minZoom={0.1}
          maxZoom={2}
          zoomOnScroll
          panOnDrag
          nodesDraggable
          nodesConnectable
          fitView
          fitViewOptions={{ maxZoom: 1, padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
          <Controls />
          <MiniMap pannable zoomable />
          <CanvasToolbar
            label={t('canvas.addText')}
            addTextAt={(position) => { addTextAt(position) }}
          />
        </ReactFlow>
      </div>
      {storageError && <div className={css.storageError} role="status">{t('canvas.storageError')}</div>}
    </div>
  )
}

export type { CanvasOverlayProps } from './contracts.ts'
