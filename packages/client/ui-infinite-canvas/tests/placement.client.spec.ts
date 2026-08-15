import { describe, expect, it } from 'vitest'
import { nextCanvasNodePosition } from '../src/client/placement.ts'

describe('nextCanvasNodePosition', () => {
  it('keeps the first node centered around the requested point', () => {
    expect(nextCanvasNodePosition({ x: 640, y: 360 }, [])).toEqual({ x: 520, y: 300 })
  })

  it('chooses the nearest grid position that does not overlap existing nodes', () => {
    const existing = [
      { position: { x: 520, y: 300 } },
      { position: { x: 800, y: 300 } },
    ]

    const placed = nextCanvasNodePosition({ x: 640, y: 360 }, existing)

    expect(placed).toEqual({ x: 240, y: 300 })
    for (const node of existing) {
      expect(Math.abs(placed.x - node.position.x) >= 264 || Math.abs(placed.y - node.position.y) >= 144).toBe(true)
    }
  })
})
