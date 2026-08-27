import { describe, expect, it } from 'vitest'
import type { SplitScreenViewport } from '@/game/camera/gameplayCameraTypes'
import { getSplitScreenLayout } from '@/game/camera/getSplitScreenLayout'

function expectValidLayout(layout: readonly SplitScreenViewport[]) {
  for (const viewport of layout) {
    expect(viewport.x).toBeGreaterThanOrEqual(0)
    expect(viewport.y).toBeGreaterThanOrEqual(0)
    expect(viewport.width).toBeGreaterThan(0)
    expect(viewport.height).toBeGreaterThan(0)
    expect(viewport.x + viewport.width).toBeLessThanOrEqual(1)
    expect(viewport.y + viewport.height).toBeLessThanOrEqual(1)
  }

  for (let firstIndex = 0; firstIndex < layout.length; firstIndex += 1) {
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < layout.length;
      secondIndex += 1
    ) {
      const first = layout[firstIndex]
      const second = layout[secondIndex]
      const overlapWidth =
        Math.min(first.x + first.width, second.x + second.width) -
        Math.max(first.x, second.x)
      const overlapHeight =
        Math.min(first.y + first.height, second.y + second.height) -
        Math.max(first.y, second.y)

      expect(overlapWidth <= 0 || overlapHeight <= 0).toBe(true)
    }
  }
}

describe('getSplitScreenLayout', () => {
  it.each([
    [1, [{ x: 0, y: 0, width: 1, height: 1 }]],
    [
      2,
      [
        { x: 0, y: 0.5, width: 1, height: 0.5 },
        { x: 0, y: 0, width: 1, height: 0.5 },
      ],
    ],
    [
      3,
      [
        { x: 0, y: 0.5, width: 0.5, height: 0.5 },
        { x: 0.5, y: 0.5, width: 0.5, height: 0.5 },
        { x: 0, y: 0, width: 0.5, height: 0.5 },
      ],
    ],
    [
      4,
      [
        { x: 0, y: 0.5, width: 0.5, height: 0.5 },
        { x: 0.5, y: 0.5, width: 0.5, height: 0.5 },
        { x: 0, y: 0, width: 0.5, height: 0.5 },
        { x: 0.5, y: 0, width: 0.5, height: 0.5 },
      ],
    ],
  ])('creates a valid layout for %i local player(s)', (playerCount, expected) => {
    const layout = getSplitScreenLayout(playerCount)

    expect(layout).toEqual(expected)
    expectValidLayout(layout)
  })

  it.each([0, 5])('rejects an invalid local player count of %i', (playerCount) => {
    expect(() => getSplitScreenLayout(playerCount)).toThrow(RangeError)
  })
})
