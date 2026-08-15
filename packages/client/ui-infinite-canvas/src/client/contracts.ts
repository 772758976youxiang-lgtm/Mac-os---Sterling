import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only imports provide the slot declarations and owner shares.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { InfiniteCanvasKey } from './locales.ts'
import type { CanvasStoreHandle } from './stores.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Mode menu and canvas editor copy. */
    infiniteCanvas: InfiniteCanvasKey
  }
}

/** Shared visual props for either mode-menu placement. */
export type ModeMenuProps = {
  wide: boolean
  /** Horizontal edge of the trigger used to anchor the disclosure. */
  align?: 'start' | 'end'
} & PropsStore<CanvasStoreHandle>
  & PropsLocale<'infiniteCanvas'>

/** Props of the brand-row mode menu slot registration. */
export type BrandModeMenuProps = PropsRuntime<'sidebar.brand.action'> & ModeMenuProps

/** Props of the full-frame canvas overlay. */
export type CanvasOverlayProps =
  & PropsRuntime<'shell.overlay'>
  & PropsStore<CanvasStoreHandle>
  & PropsLocale<'infiniteCanvas'>
