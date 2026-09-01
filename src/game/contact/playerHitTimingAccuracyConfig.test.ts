import { describe, expect, it } from 'vitest'
import { PLAYER_HIT_TIMING_ACCURACY_CONFIG } from '@/game/contact/playerHitTimingAccuracyConfig'

describe('player hit timing accuracy config', () => {
  it('defines the initial deterministic accuracy multipliers for every grade', () => {
    expect(PLAYER_HIT_TIMING_ACCURACY_CONFIG).toEqual({
      VERY_EARLY: 0.6,
      EARLY: 0.85,
      PERFECT: 1,
      LATE: 0.85,
      VERY_LATE: 0.6,
    })
  })

  it('keeps every accuracy multiplier finite and in the interval (0, 1]', () => {
    for (const multiplier of Object.values(
      PLAYER_HIT_TIMING_ACCURACY_CONFIG,
    )) {
      expect(Number.isFinite(multiplier)).toBe(true)
      expect(multiplier).toBeGreaterThan(0)
      expect(multiplier).toBeLessThanOrEqual(1)
    }
  })
})
