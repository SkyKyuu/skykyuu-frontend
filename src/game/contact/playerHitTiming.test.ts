import { describe, expect, it } from 'vitest'
import { VOLLEYBALL_SIMULATION_CONFIG } from '@/game/ball/volleyballSimulationConfig'
import { createPlayerHitTimingSample } from '@/game/contact/playerHitTiming'

const FIXED_STEP = VOLLEYBALL_SIMULATION_CONFIG.fixedStepSeconds

describe('createPlayerHitTimingSample', () => {
  it('returns a negative offset for a press before contact entry', () => {
    expect(createPlayerHitTimingSample(10, 11, FIXED_STEP)).toEqual({
      offsetSteps: -1,
      offsetSeconds: -FIXED_STEP,
    })
  })

  it('returns zero when press and contact entry share a fixed step', () => {
    expect(createPlayerHitTimingSample(10, 10, FIXED_STEP)).toEqual({
      offsetSteps: 0,
      offsetSeconds: 0,
    })
  })

  it('returns a positive offset for a press after contact entry', () => {
    expect(createPlayerHitTimingSample(12, 10, FIXED_STEP)).toEqual({
      offsetSteps: 2,
      offsetSeconds: 2 * FIXED_STEP,
    })
  })

  it('derives seconds from the configured fixed-step duration', () => {
    const sample = createPlayerHitTimingSample(7, 10, FIXED_STEP)

    expect(sample.offsetSeconds).toBeCloseTo(-0.05)
    expect(sample.offsetSeconds).toBe(sample.offsetSteps * FIXED_STEP)
  })
})
