import { describe, expect, it } from 'vitest'
import {
  validatePlayerHitAimForward,
  validatePlayerHitAimLateral,
} from '@/game/contact/playerHitAim'

describe('validatePlayerHitAimLateral', () => {
  it.each([-1, -0.5, 0, 0.5, 1])(
    'preserves valid player-local aim %s',
    (aimLateral) => {
      expect(validatePlayerHitAimLateral(aimLateral)).toBe(aimLateral)
    },
  )

  it.each([
    -1.01,
    1.01,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])('rejects invalid player-local aim %s', (aimLateral) => {
    expect(() => validatePlayerHitAimLateral(aimLateral)).toThrow(
      RangeError,
    )
    expect(() => validatePlayerHitAimLateral(aimLateral)).toThrow(
      'Player hit aim lateral must be finite and between -1 and 1',
    )
  })
})

describe('validatePlayerHitAimForward', () => {
  it.each([-1, -0.75, 0, 0.375, 1])(
    'preserves valid player-local forward aim %s',
    (aimForward) => {
      expect(validatePlayerHitAimForward(aimForward)).toBe(aimForward)
    },
  )

  it.each([
    -1.01,
    1.01,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])('rejects invalid player-local forward aim %s', (aimForward) => {
    expect(() => validatePlayerHitAimForward(aimForward)).toThrow(
      RangeError,
    )
    expect(() => validatePlayerHitAimForward(aimForward)).toThrow(
      'Player hit aim forward must be finite and between -1 and 1',
    )
  })
})
