import { describe, expect, it } from 'vitest'
import { PLAYER_HIT_AIM_PHYSICS_CONFIG } from '@/game/contact/playerHitAimPhysicsConfig'

describe('player hit aim physics config', () => {
  it('uses the initial temporary maximum lateral contribution of 3 m/s', () => {
    expect(
      PLAYER_HIT_AIM_PHYSICS_CONFIG.maxLateralVelocityContribution,
    ).toBe(3)
  })
})
