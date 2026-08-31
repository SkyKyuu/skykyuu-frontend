import { describe, expect, it } from 'vitest'
import { getPlayerHitTimingForwardMultiplier } from '@/game/contact/playerHitTimingPower'

describe('getPlayerHitTimingForwardMultiplier', () => {
  it.each([
    ['VERY_EARLY', 0.75],
    ['EARLY', 0.9],
    ['PERFECT', 1],
    ['LATE', 0.9],
    ['VERY_LATE', 0.75],
  ] as const)('maps %s to forward power x%f', (grade, multiplier) => {
    expect(getPlayerHitTimingForwardMultiplier(grade)).toBe(multiplier)
  })
})
