import { describe, expect, it } from 'vitest'
import { INDOOR_COURT } from '@/game/court/indoorCourtDimensions'

describe('INDOOR_COURT', () => {
  it('uses official indoor dimensions in metres', () => {
    expect(INDOOR_COURT).toMatchObject({
      width: 9,
      length: 18,
      halfWidth: 4.5,
      halfLength: 9,
      attackLineDistance: 3,
      lineWidth: 0.05,
      freeZone: 3,
      totalAreaWidth: 15,
      totalAreaLength: 24,
    })
  })
})
