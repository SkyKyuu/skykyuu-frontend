import { describe, expect, it } from 'vitest'
import {
  getPlayerHitAimVelocityX,
  playerHitAimLateralToWorldX,
} from '@/game/contact/playerHitAimMath'

describe('player hit aim world mapping', () => {
  it.each([
    ['A', -1, -1],
    ['A', 0, 0],
    ['A', 1, 1],
    ['B', -1, 1],
    ['B', 0, 0],
    ['B', 1, -1],
  ] as const)('maps Team %s local aim %f to world X %f', (team, aim, worldX) => {
    expect(playerHitAimLateralToWorldX(team, aim)).toBe(worldX)
  })

  it.each([
    ['A', 0.375, 0.375],
    ['B', 0.375, -0.375],
  ] as const)(
    'preserves analog magnitude for Team %s local aim %f',
    (team, aim, worldX) => {
      expect(playerHitAimLateralToWorldX(team, aim)).toBe(worldX)
    },
  )

  it.each([-1.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY])(
    'reuses the explicit F2.12 validation for invalid aim %s',
    (aim) => {
      expect(() => playerHitAimLateralToWorldX('A', aim)).toThrow(RangeError)
    },
  )
})

describe('player hit aim velocity contribution', () => {
  it.each([
    ['A', -1, -3],
    ['A', 0, 0],
    ['A', 1, 3],
    ['B', -1, 3],
    ['B', 0, 0],
    ['B', 1, -3],
    ['A', 0.5, 1.5],
    ['B', 0.5, -1.5],
  ] as const)(
    'maps Team %s local aim %f to velocity X contribution %f',
    (team, aim, velocityX) => {
      expect(getPlayerHitAimVelocityX(team, aim)).toBe(velocityX)
    },
  )
})
