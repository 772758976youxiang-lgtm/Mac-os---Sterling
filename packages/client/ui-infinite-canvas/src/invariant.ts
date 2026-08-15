/**
 * Package-owned invariant companion for
 * `@deepseek-ai/dsh-client-ui-infinite-canvas`.
 * @module @deepseek-ai/dsh-client-ui-infinite-canvas/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-infinite-canvas'

export const name = 'client-ui-infinite-canvas-invariant'
export const inject = ['invariants']

// No runtime invariant: the plugin owns only browser-local viewing state and
// its slot registrations are checked by the slot registry itself.
const install: InvariantInstaller = () => {}

export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
