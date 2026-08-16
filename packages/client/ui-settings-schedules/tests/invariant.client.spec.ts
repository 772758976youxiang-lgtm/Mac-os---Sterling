/** The package reserves its invariant ownership seat. */

import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import { apply, inject, name } from '../src/invariant.ts'

describe('ui-settings-schedules invariant companion', () => {
  it('declares and registers its package ownership', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    expect(name).toBe('client-ui-settings-schedules-invariant')
    expect(inject).toEqual(['invariants'])
    await expect(ctx.plugin({ inject: [...inject], apply }).await()).resolves.toBeDefined()
  })
})
