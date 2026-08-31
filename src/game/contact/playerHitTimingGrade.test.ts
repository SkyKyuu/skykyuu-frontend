import { describe, expect, it } from 'vitest'
import { classifyPlayerHitTiming } from '@/game/contact/playerHitTimingGrade'

describe('classifyPlayerHitTiming', () => {
  it.each([
    [-100, 'VERY_EARLY'],
    [-5, 'VERY_EARLY'],
    [-4, 'VERY_EARLY'],
    [-3, 'EARLY'],
    [-2, 'EARLY'],
    [-1, 'EARLY'],
    [0, 'PERFECT'],
    [1, 'LATE'],
    [2, 'LATE'],
    [3, 'LATE'],
    [4, 'VERY_LATE'],
    [5, 'VERY_LATE'],
    [100, 'VERY_LATE'],
  ] as const)('classifies offset %i as %s', (offsetSteps, grade) => {
    expect(classifyPlayerHitTiming(offsetSteps)).toBe(grade)
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0.5])(
    'rejects non-integer offset %s without rounding',
    (offsetSteps) => {
      expect(() => classifyPlayerHitTiming(offsetSteps)).toThrow(RangeError)
      expect(() => classifyPlayerHitTiming(offsetSteps)).toThrow(
        'Player hit timing offset must be an integer',
      )
    },
  )
})
