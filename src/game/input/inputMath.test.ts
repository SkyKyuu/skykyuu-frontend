import { describe, expect, it } from 'vitest'
import { LOCAL_INPUT_CONFIG } from '@/game/input/inputConfig'
import {
  applyRadialDeadzone,
  clamp,
  localMoveToWorld,
  normalizeMove2D,
} from '@/game/input/inputMath'

describe('input math', () => {
  it('clamps values to the requested range', () => {
    expect(clamp(-2, -1, 1)).toBe(-1)
    expect(clamp(0.4, -1, 1)).toBe(0.4)
    expect(clamp(2, -1, 1)).toBe(1)
  })

  it('keeps zero input neutral', () => {
    expect(normalizeMove2D({ lateral: 0, forward: 0 })).toEqual({
      lateral: 0,
      forward: 0,
    })
    expect(
      applyRadialDeadzone(
        { lateral: 0, forward: 0 },
        LOCAL_INPUT_CONFIG.gamepadDeadzone,
      ),
    ).toEqual({ lateral: 0, forward: 0 })
  })

  it('normalizes a maximum digital diagonal', () => {
    const move = normalizeMove2D({ lateral: 1, forward: 1 })

    expect(move.lateral).toBeCloseTo(Math.SQRT1_2)
    expect(move.forward).toBeCloseTo(Math.SQRT1_2)
    expect(Math.hypot(move.lateral, move.forward)).toBeCloseTo(1)
  })

  it('returns zero inside the radial deadzone', () => {
    expect(
      applyRadialDeadzone(
        { lateral: 0.1, forward: 0.1 },
        LOCAL_INPUT_CONFIG.gamepadDeadzone,
      ),
    ).toEqual({ lateral: 0, forward: 0 })
  })

  it('rescales the remaining magnitude outside the radial deadzone', () => {
    const move = applyRadialDeadzone(
      { lateral: 0.575, forward: 0 },
      LOCAL_INPUT_CONFIG.gamepadDeadzone,
    )

    expect(move.lateral).toBeCloseTo(0.5)
    expect(move.forward).toBe(0)
  })

  it('never returns a magnitude greater than one', () => {
    const move = applyRadialDeadzone(
      { lateral: 1, forward: 1 },
      LOCAL_INPUT_CONFIG.gamepadDeadzone,
    )

    expect(Math.hypot(move.lateral, move.forward)).toBeLessThanOrEqual(1)
  })

  it.each([
    ['A', { lateral: 0, forward: 1 }, { worldX: 0, worldZ: 1 }],
    ['A', { lateral: 0, forward: -1 }, { worldX: 0, worldZ: -1 }],
    ['A', { lateral: 1, forward: 0 }, { worldX: 1, worldZ: 0 }],
    ['A', { lateral: -1, forward: 0 }, { worldX: -1, worldZ: 0 }],
    ['B', { lateral: 0, forward: 1 }, { worldX: 0, worldZ: -1 }],
    ['B', { lateral: 0, forward: -1 }, { worldX: 0, worldZ: 1 }],
    ['B', { lateral: 1, forward: 0 }, { worldX: -1, worldZ: 0 }],
    ['B', { lateral: -1, forward: 0 }, { worldX: 1, worldZ: 0 }],
  ] as const)(
    'maps TEAM_%s local movement into world movement',
    (teamSide, localMove, expected) => {
      expect(localMoveToWorld(teamSide, localMove)).toEqual(expected)
    },
  )
})
