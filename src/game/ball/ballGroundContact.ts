import { INDOOR_COURT } from '@/game/court/indoorCourtDimensions'
import type { BallVector3 } from '@/game/ball/volleyballState'
import type { PlayerBallContactEvent } from '@/game/contact/playerBallContact'

export type CourtResult = 'IN' | 'OUT'
export type CourtSide = 'A' | 'B' | 'CENTER'

export interface BallGroundContactEvent {
  type: 'GROUND_CONTACT'
  position: BallVector3
  velocity: BallVector3
  courtResult: CourtResult
  courtSide: CourtSide
}

export type BallSimulationEvent =
  | BallGroundContactEvent
  | PlayerBallContactEvent

export function classifyIndoorCourtResult(position: BallVector3): CourtResult {
  return Math.abs(position.x) <= INDOOR_COURT.halfWidth &&
    Math.abs(position.z) <= INDOOR_COURT.halfLength
    ? 'IN'
    : 'OUT'
}

export function classifyIndoorCourtSide(position: BallVector3): CourtSide {
  if (position.z < 0) {
    return 'A'
  }

  if (position.z > 0) {
    return 'B'
  }

  return 'CENTER'
}

export function createBallGroundContactEvent(
  position: BallVector3,
  velocity: BallVector3,
): BallGroundContactEvent {
  return {
    type: 'GROUND_CONTACT',
    position: { ...position },
    velocity: { ...velocity },
    courtResult: classifyIndoorCourtResult(position),
    courtSide: classifyIndoorCourtSide(position),
  }
}
