import { describe, expect, it } from 'vitest'
import { PLAYER_HIT_TIMING_POWER_CONFIG } from '@/game/contact/playerHitTimingPowerConfig'

describe('player hit timing power config', () => {
  it('defines the deterministic forward multipliers for every grade', () => {
    expect(PLAYER_HIT_TIMING_POWER_CONFIG).toEqual({
      VERY_EARLY: 0.75,
      EARLY: 0.9,
      PERFECT: 1,
      LATE: 0.9,
      VERY_LATE: 0.75,
    })
  })
})
