import { describe, expect, it } from 'vitest'
import type { LocalPlayerInputSnapshot } from '@/game/input/inputTypes'
import { PLAYER_JUMP_CONFIG } from '@/game/movement/playerJumpConfig'
import { getJumpInitialVelocity } from '@/game/movement/playerJumpMath'
import {
  PlayerMovementController,
  type PlayerMovementTarget,
} from '@/game/movement/PlayerMovementController'

interface SnapshotOptions {
  playerId?: string
  worldX?: number
  worldZ?: number
  jumpHeld?: boolean
  jumpPressed?: boolean
}

function createSnapshot(
  options: SnapshotOptions = {},
): LocalPlayerInputSnapshot {
  const {
    playerId = 'player-1',
    worldX = 0,
    worldZ = 0,
    jumpHeld = false,
    jumpPressed = false,
  } = options

  return {
    playerId,
    teamSide: 'A',
    deviceKind: 'keyboard',
    deviceName: 'Test keyboard',
    deviceConnected: true,
    localMove: { lateral: 0, forward: 0 },
    worldMove: { worldX, worldZ },
    jumpHeld,
    jumpPressed,
    hitHeld: false,
    hitPressed: false,
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

function runUntilGrounded(
  controller: PlayerMovementController,
  target: PlayerMovementTarget,
  jumpHeld = false,
): void {
  for (let frame = 0; frame < 120; frame += 1) {
    controller.update([createSnapshot({ jumpHeld })], 1 / 60)

    if (controller.getPlayerState(target.playerId)?.grounded) {
      return
    }
  }

  throw new Error('Player did not land within the expected time')
}

describe('PlayerMovementController', () => {
  it('moves a registered player root from its world-space snapshot', () => {
    const target = createTarget()
    const controller = new PlayerMovementController([target])

    controller.update([createSnapshot({ worldX: 1, worldZ: -1 })], 0.05)

    expect(target.position).toEqual({ x: 0.225, y: 0, z: -4.725 })
  })

  it('leaves a grounded player still for neutral input', () => {
    const target = createTarget()
    const controller = new PlayerMovementController([target])

    controller.update([createSnapshot()], 0.05)

    expect(target.position).toEqual({ x: 0, y: 0, z: -4.5 })
    expect(controller.getPlayerState(target.playerId)).toEqual({
      verticalVelocity: 0,
      grounded: true,
    })
  })

  it('starts a jump only from a jumpPressed edge while grounded', () => {
    const target = createTarget()
    const controller = new PlayerMovementController([target])

    controller.update(
      [createSnapshot({ jumpHeld: true, jumpPressed: true })],
      0.05,
    )

    expect(target.position.y).toBeGreaterThan(0)
    expect(controller.getPlayerState(target.playerId)).toMatchObject({
      grounded: false,
      verticalVelocity: expect.any(Number),
    })
    expect(
      controller.getPlayerState(target.playerId)?.verticalVelocity,
    ).toBeGreaterThan(0)
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'arms a jump edge when the frame delta is zero or invalid (%s)',
    (deltaSeconds) => {
      const target = createTarget()
      const controller = new PlayerMovementController([target])

      controller.update(
        [createSnapshot({ jumpHeld: true, jumpPressed: true })],
        deltaSeconds,
      )

      expect(target.position.y).toBe(PLAYER_JUMP_CONFIG.groundY)
      expect(controller.getPlayerState(target.playerId)).toEqual({
        verticalVelocity: getJumpInitialVelocity(),
        grounded: false,
      })
    },
  )

  it('uses the same capped delta for horizontal and vertical movement', () => {
    const target = createTarget()
    const controller = new PlayerMovementController([target])

    controller.update(
      [
        createSnapshot({
          worldX: 1,
          jumpHeld: true,
          jumpPressed: true,
        }),
      ],
      1,
    )

    const cappedDelta = 0.05

    expect(target.position.x).toBeCloseTo(4.5 * cappedDelta)
    expect(target.position.y).toBeCloseTo(
      getJumpInitialVelocity() * cappedDelta -
        0.5 * PLAYER_JUMP_CONFIG.gravity * cappedDelta ** 2,
    )
  })

  it('does not restart vertical velocity while jump remains held', () => {
    const target = createTarget()
    const controller = new PlayerMovementController([target])

    controller.update(
      [createSnapshot({ jumpHeld: true, jumpPressed: true })],
      0.05,
    )
    const velocityAfterPress = controller.getPlayerState(
      target.playerId,
    )?.verticalVelocity

    for (let frame = 0; frame < 3; frame += 1) {
      controller.update([createSnapshot({ jumpHeld: true })], 0.05)
    }

    expect(
      controller.getPlayerState(target.playerId)?.verticalVelocity,
    ).toBeLessThan(velocityAfterPress ?? 0)
  })

  it('ignores a second jumpPressed edge while airborne', () => {
    const target = createTarget()
    const controller = new PlayerMovementController([target])

    controller.update([createSnapshot({ jumpPressed: true })], 0.05)
    const previousVelocity = controller.getPlayerState(
      target.playerId,
    )?.verticalVelocity
    controller.update([createSnapshot({ jumpPressed: true })], 0.05)

    expect(
      controller.getPlayerState(target.playerId)?.verticalVelocity,
    ).toBeCloseTo((previousVelocity ?? 0) - PLAYER_JUMP_CONFIG.gravity * 0.05)
  })

  it('lands exactly on the ground without auto-jumping while held', () => {
    const target = createTarget()
    const controller = new PlayerMovementController([target])

    controller.update(
      [createSnapshot({ jumpHeld: true, jumpPressed: true })],
      1 / 60,
    )
    runUntilGrounded(controller, target, true)

    expect(target.position.y).toBe(PLAYER_JUMP_CONFIG.groundY)
    expect(controller.getPlayerState(target.playerId)).toEqual({
      verticalVelocity: 0,
      grounded: true,
    })

    for (let frame = 0; frame < 10; frame += 1) {
      controller.update([createSnapshot({ jumpHeld: true })], 1 / 60)
    }

    expect(target.position.y).toBe(PLAYER_JUMP_CONFIG.groundY)
    expect(controller.getPlayerState(target.playerId)?.grounded).toBe(true)
  })

  it('allows a new jump after landing, release, and a new press', () => {
    const target = createTarget()
    const controller = new PlayerMovementController([target])

    controller.update(
      [createSnapshot({ jumpHeld: true, jumpPressed: true })],
      1 / 60,
    )
    runUntilGrounded(controller, target, true)
    controller.update([createSnapshot()], 1 / 60)
    controller.update(
      [createSnapshot({ jumpHeld: true, jumpPressed: true })],
      1 / 60,
    )

    expect(target.position.y).toBeGreaterThan(PLAYER_JUMP_CONFIG.groundY)
    expect(controller.getPlayerState(target.playerId)?.grounded).toBe(false)
  })

  it('updates horizontal and vertical movement in the same frame', () => {
    const target = createTarget()
    const controller = new PlayerMovementController([target])

    controller.update(
      [
        createSnapshot({
          worldX: 1,
          worldZ: -1,
          jumpPressed: true,
        }),
      ],
      0.05,
    )

    expect(target.position.x).toBeGreaterThan(0)
    expect(target.position.z).toBeLessThan(-4.5)
    expect(target.position.y).toBeGreaterThan(0)
  })

  it('keeps vertical movement independent from horizontal bounds', () => {
    const target = createTarget({ x: 7.22, y: 0, z: -0.28 })
    const controller = new PlayerMovementController([target])

    controller.update(
      [
        createSnapshot({
          worldX: 1,
          worldZ: 1,
          jumpPressed: true,
        }),
      ],
      0.05,
    )

    expect(target.position.x).toBe(7.22)
    expect(target.position.z).toBe(-0.28)
    expect(target.position.y).toBeGreaterThan(0)
  })

  it('treats an initially elevated target as airborne', () => {
    const target = createTarget({ x: 0, y: 1.25, z: -4.5 })
    const controller = new PlayerMovementController([target])

    expect(controller.getPlayerState(target.playerId)).toEqual({
      verticalVelocity: 0,
      grounded: false,
    })

    controller.update([createSnapshot()], 0.05)

    expect(target.position.y).toBeLessThan(1.25)
    expect(target.position.y).toBeGreaterThan(0)
  })

  it('ignores snapshots for unknown players', () => {
    const target = createTarget()
    const controller = new PlayerMovementController([target])

    expect(() =>
      controller.update(
        [createSnapshot({ playerId: 'unknown-player', jumpPressed: true })],
        0.05,
      ),
    ).not.toThrow()
    expect(target.position).toEqual({ x: 0, y: 0, z: -4.5 })
    expect(controller.getPlayerState('unknown-player')).toBeUndefined()
  })
})
