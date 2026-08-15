const NODE_WIDTH_WITH_GAP = 280
const NODE_HEIGHT_WITH_GAP = 144
const MAX_SEARCH_RADIUS = 40

/**
 * Find the nearest grid position whose fixed text-node footprint does not
 * intersect an existing node position.
 * @param origin - Flow-space point around which the new node should appear.
 * @param nodes - Existing canvas nodes whose positions must be avoided.
 * @returns A top-left flow-space position for the new text node.
 */
export function nextCanvasNodePosition(
  origin: { x: number; y: number },
  nodes: readonly { position: { x: number; y: number } }[],
): { x: number; y: number } {
  const base = { x: origin.x - 120, y: origin.y - 60 }
  const available = (position: { x: number; y: number }): boolean => nodes.every(node => (
    Math.abs(position.x - node.position.x) >= NODE_WIDTH_WITH_GAP
    || Math.abs(position.y - node.position.y) >= NODE_HEIGHT_WITH_GAP
  ))

  for (let radius = 0; radius <= MAX_SEARCH_RADIUS; radius += 1) {
    for (let y = 0; y <= radius; y += 1) {
      const yOffsets = y === 0 ? [0] : [y, -y]
      const x = radius - y
      const xOffsets = x === 0 ? [0] : [x, -x]
      for (const yOffset of yOffsets) {
        for (const xOffset of xOffsets) {
          const candidate = {
            x: base.x + xOffset * NODE_WIDTH_WITH_GAP,
            y: base.y + yOffset * NODE_HEIGHT_WITH_GAP,
          }
          if (available(candidate)) return candidate
        }
      }
    }
  }

  return {
    x: base.x,
    y: base.y + (MAX_SEARCH_RADIUS + 1) * NODE_HEIGHT_WITH_GAP,
  }
}
