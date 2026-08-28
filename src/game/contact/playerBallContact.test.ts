import { describe, expect, it } from 'vitest'
import { VOLLEYBALL_CONFIG } from '@/game/ball/volleyballConfig'
import {
  createPlayerBallContactEvent,
  getClosestPointOnPlayerCapsule,
  isBallOverlappingPlayer,
  type PlayerBallContactTarget,
} from '@/game/contact/playerBallContact'
import { PLACEHOLDER_PLAYER } from '@/game/player/playerDimensions'

const TARGET: PlayerBallContactTarget = {
  playerId: 'player-test',
  teamSide: 'B',
  position: { x: 1, y: 0, z: 2 },
}

const COMBINED_RADIUS =
  PLACEHOLDER_PLAYER.radius + VOLLEYBALL_CONFIG.radius

describe('player-ball capsule contact math', () => {
  it('detects a ball centred on the capsule axis', () => {
    expect(
      isBallOverlappingPlayer({ x: 1, y: 1, z: 2 }, TARGET),
    ).toBe(true)
  })

  it('rejects a ball laterally beyond the combined radius', () => {
    expect(
      isBallOverlappingPlayer(
        { x: 1 + COMBINED_RADIUS + 0.001, y: 1, z: 2 },
        TARGET,
      ),
    ).toBe(false)
  })

  it('includes contact exactly on the combined-radius boundary', () => {
    expect(
      isBallOverlappingPlayer(
        { x: 1 + COMBINED_RADIUS, y: 1, z: 2 },
        TARGET,
      ),
    ).toBe(true)
  })

  it('uses the spherical bottom cap below the capsule axis', () => {
    const bottomY = TARGET.position.y + PLACEHOLDER_PLAYER.radius
    const ballPosition = {
      x: TARGET.position.x,
      y: bottomY - COMBINED_RADIUS,
      z: TARGET.position.z,
    }

    expect(getClosestPointOnPlayerCapsule(ballPosition, TARGET).y).toBe(
      bottomY,
    )
    expect(isBallOverlappingPlayer(ballPosition, TARGET)).toBe(true)
  })

  it('uses the spherical top cap above the capsule axis', () => {
    const topY =
      TARGET.position.y +
      PLACEHOLDER_PLAYER.height -
      PLACEHOLDER_PLAYER.radius
    const ballPosition = {
      x: TARGET.position.x,
      y: topY + COMBINED_RADIUS,
      z: TARGET.position.z,
    }

    expect(getClosestPointOnPlayerCapsule(ballPosition, TARGET).y).toBe(topY)
    expect(isBallOverlappingPlayer(ballPosition, TARGET)).toBe(true)
  })

  it('moves the complete capsule with a jumping player root', () => {
    const jumpingTarget = {
      ...TARGET,
      position: { ...TARGET.position, y: 1.25 },
    }
    const bottomY = jumpingTarget.position.y + PLACEHOLDER_PLAYER.radius
    const topY =
      jumpingTarget.position.y +
      PLACEHOLDER_PLAYER.height -
      PLACEHOLDER_PLAYER.radius

    expect(
      getClosestPointOnPlayerCapsule(
        { x: 1, y: Number.NEGATIVE_INFINITY, z: 2 },
        jumpingTarget,
      ).y,
    ).toBe(bottomY)
    expect(
      getClosestPointOnPlayerCapsule(
        { x: 1, y: Number.POSITIVE_INFINITY, z: 2 },
        jumpingTarget,
      ).y,
    ).toBe(topY)
  })

  it('copies ball and player values into the contact event', () => {
    const ballState = {
      position: { x: 3, y: 4, z: 5 },
      velocity: { x: 6, y: 7, z: 8 },
    }
    const playerTarget = {
      ...TARGET,
      position: { ...TARGET.position },
    }
    const event = createPlayerBallContactEvent(ballState, playerTarget)

    ballState.position.x = 99
    ballState.velocity.y = 99
    playerTarget.position.z = 99

    expect(event).toEqual({
      type: 'PLAYER_CONTACT',
      playerId: 'player-test',
      teamSide: 'B',
      ballPosition: { x: 3, y: 4, z: 5 },
      ballVelocity: { x: 6, y: 7, z: 8 },
      playerPosition: { x: 1, y: 0, z: 2 },
    })
  })
})
