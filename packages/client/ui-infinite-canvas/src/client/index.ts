/** Browser-side infinite creation mode: a shared mode/document store with
 * one brand-row menu and one full-frame canvas overlay. */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only imports pull the owner slot declarations into this package's
// composed component contracts without creating plugin value edges.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import '@xyflow/react/dist/style.css'
import { CanvasOverlay } from './CanvasOverlay.tsx'
import type { CanvasOverlayProps, BrandModeMenuProps } from './contracts.ts'
import { en, zh, type InfiniteCanvasKey } from './locales.ts'
import { ModeMenu } from './ModeMenu.tsx'
import { createCanvasStore } from './stores.ts'

export type { CanvasOverlayProps, BrandModeMenuProps }
export type { CanvasMode, CanvasDocument, CanvasEdgeRecord, CanvasNodeRecord } from './stores.ts'
export type { InfiniteCanvasKey }

/** Locale namespace owned by this plugin. */
const NS = 'infiniteCanvas'

/** Required services: slot registry and locale registry. */
export const inject = ['slots', 'locale']

/** Register the mode menu and canvas overlay with one shared root store. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-infinite-canvas: dictionaries')
  const store = createCanvasStore()

  ctx.slots.inject('sidebar.brand.action', () => ctx.slots.register({
    name: 'sidebar.brand.action',
    id: 'infinite-canvas-mode',
    order: 10,
    locale: NS,
    store,
  }, ModeMenu))

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'infinite-canvas',
    order: 10,
    locale: NS,
    store,
  }, CanvasOverlay))
}
