import type {
  BallVector3,
  VolleyballState,
} from '@/game/ball/volleyballState'
import type { PlayerBallContactEvent } from '@/game/contact/playerBallContact'
import { PLAYER_CONTACT_RESPONSE_CONFIG } from '@/game/contact/playerBallContactResponseConfig'
import type { PlayerHitTimingSample } from '@/game/contact/playerHitTiming'
import type { PlayerHitTimingGrade } from '@/game/contact/playerHitTimingGrade'
import { getPlayerHitTimingForwardMultiplier } from '@/game/contact/playerHitTimingPower'
import type { TeamSide } from '@/game/team/teamTypes'

export interface PlayerBallContactResponseEvent {
  type: 'PLAYER_CONTACT_RESPONSE'
  playerId: string
  teamSide: TeamSide
  ballPosition: BallVector3
  incomingVelocity: BallVector3
  outgoingVelocity: BallVector3
  hitTimingOffsetSteps: number
  hitTimingOffsetSeconds: number
  hitTimingGrade: PlayerHitTimingGrade
  hitTimingForwardMultiplier: number
}

export function getPlayerContactResponseVelocity(
  incomingVelocity: BallVector3,
  teamSide: TeamSide,
  hitTimingGrade: PlayerHitTimingGrade,
): BallVector3 {
  const forwardMagnitude =
    PLAYER_CONTACT_RESPONSE_CONFIG.forwardVelocity *
    getPlayerHitTimingForwardMultiplier(hitTimingGrade)

  return {
    x: incomingVelocity.x,
    y: PLAYER_CONTACT_RESPONSE_CONFIG.upwardVelocity,
    z: teamSide === 'A' ? forwardMagnitude : -forwardMagnitude,
  }
}

export function applyPlayerContactResponse(
  state: VolleyballState,
  playerContact: PlayerBallContactEvent,
  hitTimingGrade: PlayerHitTimingGrade,
): VolleyballState {
  return {
    position: { ...state.position },
    velocity: getPlayerContactResponseVelocity(
      state.velocity,
      playerContact.teamSide,
      hitTimingGrade,
    ),
  }
}

export function createPlayerBallContactResponseEvent(
  playerContact: PlayerBallContactEvent,
  outgoingVelocity: BallVector3,
  hitTiming: PlayerHitTimingSample,
  hitTimingGrade: PlayerHitTimingGrade,
  hitTimingForwardMultiplier: number,
): PlayerBallContactResponseEvent {
  return {
    type: 'PLAYER_CONTACT_RESPONSE',
    playerId: playerContact.playerId,
    teamSide: playerContact.teamSide,
    ballPosition: { ...playerContact.ballPosition },
    incomingVelocity: { ...playerContact.ballVelocity },
    outgoingVelocity: { ...outgoingVelocity },
    hitTimingOffsetSteps: hitTiming.offsetSteps,
    hitTimingOffsetSeconds: hitTiming.offsetSeconds,
    hitTimingGrade,
    hitTimingForwardMultiplier,
  }
}
