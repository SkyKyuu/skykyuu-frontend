import { describe, expect, it } from 'vitest'
import type { LocalPlayerInputSnapshot } from '@/game/input/inputTypes'
import {
  PlayerMovementController,
  type PlayerMovementTarget,
} from '@/game/movement/PlayerMovementController'

function createSnapshot(
  playerId: string,
  worldX: number,
  worldZ: number,
  jumpHeld = false,
): LocalPlayerInputSnapshot {
  return {
    playerId,
    teamSide: 'A',
    deviceKind: 'keyboard',
    deviceName: 'Test keyboard',
    deviceConnected: true,
    localMove: { lateral: 0, forward: 0 },
    worldMove: { worldX, worldZ },
    jumpHeld,
    jumpPressed: jumpHeld,
  }
}

function createTarget(
  position = { x: 0, y: 0, z: -4.5 },
): PlayerMovementTarget {
  return {
    playerId: 'player-1',
    teamSide: 'A',
    position,
  }
}

describe('PlayerMovementController', () => {
  it('moves a registered player root from its world-space snapshot', () => {
    const target = createTarget()
    const controller = new PlayerMovementController([target])

    controller.update([createSnapshot('player-1', 1, -1)], 0.05)

    expect(target.position.x).toBeCloseTo(0.225)
    expect(target.position.z).toBeCloseTo(-4.725)
  })

  it('leaves a registered player still for neutral input', () => {
    const target = createTarget()
    const controller = new PlayerMovementController([target])

    controller.update([createSnapshot('player-1', 0, 0)], 0.05)

    expect(target.position).toEqual({ x: 0, y: 0, z: -4.5 })
  })

  it('never changes the vertical position, including while jump is held', () => {
    const target = createTarget({ x: 0, y: 1.25, z: -4.5 })
    const controller = new PlayerMovementController([target])

    controller.update([createSnapshot('player-1', 1, 1, true)], 0.05)

    expect(target.position.y).toBe(1.25)
  })

  it('ignores snapshots for unknown players', () => {
    const target = createTarget()
    const controller = new PlayerMovementController([target])

    expect(() =>
      controller.update([createSnapshot('unknown-player', 1, 1)], 0.05),
    ).not.toThrow()
    expect(target.position).toEqual({ x: 0, y: 0, z: -4.5 })
  })

  it('caps movement at the registered team bounds', () => {
    const target = createTarget({ x: 7.22, y: 0, z: -0.28 })
    const controller = new PlayerMovementController([target])

    controller.update([createSnapshot('player-1', 1, 1)], 1)

    expect(target.position).toEqual({ x: 7.22, y: 0, z: -0.28 })
  })
})
