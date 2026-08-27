import { INDOOR_COURT } from '@/game/court/indoorCourtDimensions'
import { clamp } from '@/game/input/inputMath'
import type { WorldMoveInput } from '@/game/input/inputTypes'
import { PLAYER_MOVEMENT_CONFIG } from '@/game/movement/playerMovementConfig'
import type { TeamSide } from '@/game/team/teamTypes'

export interface HorizontalPosition {
  x: number
  z: number
}

export interface IndoorMovementBounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export function getSafeDeltaSeconds(deltaSeconds: number): number {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
    return 0
  }

  return Math.min(deltaSeconds, PLAYER_MOVEMENT_CONFIG.maxDeltaSeconds)
}

export function getHorizontalDisplacement(
  worldMove: WorldMoveInput,
  deltaSeconds: number,
  moveSpeed = PLAYER_MOVEMENT_CONFIG.moveSpeed,
): HorizontalPosition {
  return {
    x: worldMove.worldX * moveSpeed * deltaSeconds,
    z: worldMove.worldZ * moveSpeed * deltaSeconds,
  }
}

export function getIndoorMovementBounds(
  teamSide: TeamSide,
  playerRadius: number,
): IndoorMovementBounds {
  const radius =
    Number.isFinite(playerRadius) && playerRadius > 0 ? playerRadius : 0
  const halfAreaWidth = INDOOR_COURT.totalAreaWidth / 2
  const halfAreaLength = INDOOR_COURT.totalAreaLength / 2

  return {
    minX: -halfAreaWidth + radius,
    maxX: halfAreaWidth - radius,
    minZ: teamSide === 'A' ? -halfAreaLength + radius : radius,
    maxZ: teamSide === 'A' ? -radius : halfAreaLength - radius,
  }
}

export function getNextHorizontalPosition(
  position: HorizontalPosition,
  worldMove: WorldMoveInput,
  deltaSeconds: number,
  bounds: IndoorMovementBounds,
  moveSpeed = PLAYER_MOVEMENT_CONFIG.moveSpeed,
): HorizontalPosition {
  const displacement = getHorizontalDisplacement(
    worldMove,
    deltaSeconds,
    moveSpeed,
  )

  return {
    x: clamp(position.x + displacement.x, bounds.minX, bounds.maxX),
    z: clamp(position.z + displacement.z, bounds.minZ, bounds.maxZ),
  }
}
