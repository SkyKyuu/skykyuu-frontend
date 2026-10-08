import { describe, expect, it } from 'vitest'
import { PLAYER_HIT_AIM_PHYSICS_CONFIG } from '@/game/contact/playerHitAimPhysicsConfig'

describe('player hit aim physics config', () => {
  it('uses the initial temporary maximum lateral contribution of 3 m/s', () => {
    expect(
      PLAYER_HIT_AIM_PHYSICS_CONFIG.maxLateralVelocityContribution,
    ).toBe(3)
  })
  it('uses the frozen maximum forward contribution of 2 m/s', () => {
    expect(PLAYER_HIT_AIM_PHYSICS_CONFIG.maxForwardVelocityContribution).toBe(2)
  })
})
