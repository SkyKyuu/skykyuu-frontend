import { describe, expect, it } from 'vitest'
import { getPlayerHitTimingEffectiveAimLateral } from '@/game/contact/playerHitTimingAccuracyAim'

describe('getPlayerHitTimingEffectiveAimLateral', () => {
  it.each([
    [1, 1, 1],
    [1, 0.85, 0.85],
    [1, 0.6, 0.6],
    [-1, 0.85, -0.85],
    [0.5, 0.85, 0.425],
    [0, 0.6, 0],
  ] as const)(
    'applies raw aim %f with accuracy x%f as %f without quantizing',
    (rawAim, accuracy, effectiveAim) => {
      expect(
        getPlayerHitTimingEffectiveAimLateral(rawAim, accuracy),
      ).toBe(effectiveAim)
    },
  )

  it.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    0,
    -0.1,
    1.01,
  ])('rejects invalid accuracy multiplier %s', (accuracy) => {
    expect(() =>
      getPlayerHitTimingEffectiveAimLateral(1, accuracy),
    ).toThrow(RangeError)
  })

  it.each([-1.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY])(
    'reuses raw aim validation for invalid aim %s',
    (rawAim) => {
      expect(() =>
        getPlayerHitTimingEffectiveAimLateral(rawAim, 0.85),
      ).toThrow(RangeError)
    },
  )
})
