import { describe, expect, it } from 'vitest'
import { getPlayerHitTimingAccuracyMultiplier } from '@/game/contact/playerHitTimingAccuracy'

describe('getPlayerHitTimingAccuracyMultiplier', () => {
  it.each([
    ['VERY_EARLY', 0.6],
    ['EARLY', 0.85],
    ['PERFECT', 1],
    ['LATE', 0.85],
    ['VERY_LATE', 0.6],
  ] as const)('maps %s to accuracy x%f', (grade, multiplier) => {
    expect(getPlayerHitTimingAccuracyMultiplier(grade)).toBe(multiplier)
  })
})
