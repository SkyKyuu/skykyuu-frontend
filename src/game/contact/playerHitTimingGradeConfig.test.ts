import { describe, expect, it } from 'vitest'
import { PLAYER_HIT_TIMING_GRADE_CONFIG } from '@/game/contact/playerHitTimingGradeConfig'

describe('player hit timing grade config', () => {
  it('defines the deterministic fixed-step grade boundaries', () => {
    expect(PLAYER_HIT_TIMING_GRADE_CONFIG).toEqual({
      veryEarlyMaxOffsetSteps: -4,
      earlyMinOffsetSteps: -3,
      earlyMaxOffsetSteps: -1,
      perfectOffsetSteps: 0,
      lateMinOffsetSteps: 1,
      lateMaxOffsetSteps: 3,
      veryLateMinOffsetSteps: 4,
    })
  })
})
