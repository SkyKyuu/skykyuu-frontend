import { describe, expect, it } from 'vitest'
import {
  validatePlayerHitAimLateral,
  validatePlayerHitAimForward,
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
  it.each([-1, -Math.SQRT1_2, 0, 0.5, Math.SQRT1_2, 1])(
    'preserves raw local forward %s without quantization',
    (value) => expect(validatePlayerHitAimForward(value)).toBe(value),
  )

  it.each([-1.01, 1.01, NaN, Infinity, -Infinity])(
    'rejects invalid forward %s',
    (value) => expect(() => validatePlayerHitAimForward(value)).toThrow(
      'Player hit aim forward must be finite and between -1 and 1',
    ),
  )
})
