import { describe, expect, it } from 'vitest'
import {
  getHorizontalDisplacement,
  getIndoorMovementBounds,
  getNextHorizontalPosition,
  getSafeDeltaSeconds,
  type HorizontalPosition,
  type IndoorMovementBounds,
} from '@/game/movement/playerMovementMath'
import { PLACEHOLDER_PLAYER } from '@/game/player/playerDimensions'

const UNRESTRICTED_BOUNDS: IndoorMovementBounds = {
  minX: -100,
  maxX: 100,
  minZ: -100,
  maxZ: 100,
}

function simulateFrames(
  frameCount: number,
  deltaSeconds: number,
): HorizontalPosition {
  let position: HorizontalPosition = { x: 0, z: 0 }

  for (let frame = 0; frame < frameCount; frame += 1) {
    position = getNextHorizontalPosition(
      position,
      { worldX: 1, worldZ: 0 },
      deltaSeconds,
      UNRESTRICTED_BOUNDS,
    )
  }

  return position
}

describe('player movement math', () => {
  it('moves at 4.5 meters per second on the horizontal axes', () => {
    expect(
      getHorizontalDisplacement({ worldX: 1, worldZ: 0 }, 1),
    ).toEqual({ x: 4.5, z: 0 })
    expect(
      getHorizontalDisplacement({ worldX: 0, worldZ: -1 }, 1),
    ).toEqual({ x: 0, z: -4.5 })
  })

  it('does not move for neutral input', () => {
    expect(
      getNextHorizontalPosition(
        { x: 2, z: -3 },
        { worldX: 0, worldZ: 0 },
        0.05,
        UNRESTRICTED_BOUNDS,
      ),
    ).toEqual({ x: 2, z: -3 })
  })

  it('produces equivalent travel at 30 and 60 frames per second', () => {
    expect(simulateFrames(30, 1 / 30).x).toBeCloseTo(4.5)
    expect(simulateFrames(60, 1 / 60).x).toBeCloseTo(4.5)
    expect(simulateFrames(30, 1 / 30)).toEqual(
      expect.objectContaining({
        x: expect.closeTo(simulateFrames(60, 1 / 60).x),
        z: 0,
      }),
    )
  })

  it('preserves the configured speed for normalized diagonal input', () => {
    const diagonal = 1 / Math.sqrt(2)
    const displacement = getHorizontalDisplacement(
      { worldX: diagonal, worldZ: diagonal },
      1,
    )

    expect(Math.hypot(displacement.x, displacement.z)).toBeCloseTo(4.5)
  })

  it('caps long frame deltas and rejects invalid deltas', () => {
    expect(getSafeDeltaSeconds(0.2)).toBe(0.05)
    expect(getSafeDeltaSeconds(0.04)).toBe(0.04)
    expect(getSafeDeltaSeconds(0)).toBe(0)
    expect(getSafeDeltaSeconds(-1)).toBe(0)
    expect(getSafeDeltaSeconds(Number.NaN)).toBe(0)
    expect(getSafeDeltaSeconds(Number.POSITIVE_INFINITY)).toBe(0)
  })

  it('derives TEAM_A bounds from the indoor free zone and player radius', () => {
    expect(getIndoorMovementBounds('A', PLACEHOLDER_PLAYER.radius)).toEqual({
      minX: -7.22,
      maxX: 7.22,
      minZ: -11.72,
      maxZ: -0.28,
    })
  })

  it('derives TEAM_B bounds without permitting a net crossing', () => {
    expect(getIndoorMovementBounds('B', PLACEHOLDER_PLAYER.radius)).toEqual({
      minX: -7.22,
      maxX: 7.22,
      minZ: 0.28,
      maxZ: 11.72,
    })
  })

  it('clamps both horizontal axes to their allowed bounds', () => {
    const bounds = getIndoorMovementBounds('A', PLACEHOLDER_PLAYER.radius)

    expect(
      getNextHorizontalPosition(
        { x: bounds.maxX, z: bounds.minZ },
        { worldX: 1, worldZ: -1 },
        0.05,
        bounds,
      ),
    ).toEqual({ x: bounds.maxX, z: bounds.minZ })

    expect(
      getNextHorizontalPosition(
        { x: bounds.minX, z: bounds.maxZ },
        { worldX: -1, worldZ: 1 },
        0.05,
        bounds,
      ),
    ).toEqual({ x: bounds.minX, z: bounds.maxZ })
  })

  it('slides along one boundary while the free axis keeps moving', () => {
    const bounds = getIndoorMovementBounds('B', PLACEHOLDER_PLAYER.radius)
    const nextPosition = getNextHorizontalPosition(
      { x: bounds.maxX, z: 4.5 },
      { worldX: 1, worldZ: 1 },
      0.05,
      bounds,
    )

    expect(nextPosition.x).toBe(bounds.maxX)
    expect(nextPosition.z).toBeCloseTo(4.725)
  })
})
