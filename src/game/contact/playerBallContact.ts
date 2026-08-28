import { VOLLEYBALL_CONFIG } from '@/game/ball/volleyballConfig'
import type {
  BallVector3,
  VolleyballState,
} from '@/game/ball/volleyballState'
import { PLACEHOLDER_PLAYER } from '@/game/player/playerDimensions'
import type { TeamSide } from '@/game/team/teamTypes'

export interface PlayerBallContactTarget {
  playerId: string
  teamSide: TeamSide
  position: BallVector3
}

export interface PlayerBallContactEvent {
  type: 'PLAYER_CONTACT'
  playerId: string
  teamSide: TeamSide
  ballPosition: BallVector3
  ballVelocity: BallVector3
  playerPosition: BallVector3
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

export function getClosestPointOnPlayerCapsule(
  ballPosition: BallVector3,
  playerTarget: PlayerBallContactTarget,
): BallVector3 {
  const capsuleBottomY =
    playerTarget.position.y + PLACEHOLDER_PLAYER.radius
  const capsuleTopY =
    playerTarget.position.y +
    PLACEHOLDER_PLAYER.height -
    PLACEHOLDER_PLAYER.radius

  return {
    x: playerTarget.position.x,
    y: clamp(ballPosition.y, capsuleBottomY, capsuleTopY),
    z: playerTarget.position.z,
  }
}

export function isBallOverlappingPlayer(
  ballPosition: BallVector3,
  playerTarget: PlayerBallContactTarget,
): boolean {
  const closestPoint = getClosestPointOnPlayerCapsule(
    ballPosition,
    playerTarget,
  )
  const offsetX = ballPosition.x - closestPoint.x
  const offsetY = ballPosition.y - closestPoint.y
  const offsetZ = ballPosition.z - closestPoint.z
  const distanceSquared =
    offsetX * offsetX + offsetY * offsetY + offsetZ * offsetZ
  const combinedRadius =
    PLACEHOLDER_PLAYER.radius + VOLLEYBALL_CONFIG.radius

  return distanceSquared <= combinedRadius * combinedRadius
}

export function createPlayerBallContactEvent(
  ballState: VolleyballState,
  playerTarget: PlayerBallContactTarget,
): PlayerBallContactEvent {
  return {
    type: 'PLAYER_CONTACT',
    playerId: playerTarget.playerId,
    teamSide: playerTarget.teamSide,
    ballPosition: { ...ballState.position },
    ballVelocity: { ...ballState.velocity },
    playerPosition: { ...playerTarget.position },
  }
}
