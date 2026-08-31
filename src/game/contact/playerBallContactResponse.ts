import type {
  BallVector3,
  VolleyballState,
} from '@/game/ball/volleyballState'
import type { PlayerBallContactEvent } from '@/game/contact/playerBallContact'
import { PLAYER_CONTACT_RESPONSE_CONFIG } from '@/game/contact/playerBallContactResponseConfig'
import type { PlayerHitTimingSample } from '@/game/contact/playerHitTiming'
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
}

export function getDefaultPlayerContactResponseVelocity(
  incomingVelocity: BallVector3,
  teamSide: TeamSide,
): BallVector3 {
  return {
    x: incomingVelocity.x,
    y: PLAYER_CONTACT_RESPONSE_CONFIG.upwardVelocity,
    z:
      teamSide === 'A'
        ? PLAYER_CONTACT_RESPONSE_CONFIG.forwardVelocity
        : -PLAYER_CONTACT_RESPONSE_CONFIG.forwardVelocity,
  }
}

export function applyPlayerContactResponse(
  state: VolleyballState,
  playerContact: PlayerBallContactEvent,
): VolleyballState {
  return {
    position: { ...state.position },
    velocity: getDefaultPlayerContactResponseVelocity(
      state.velocity,
      playerContact.teamSide,
    ),
  }
}

export function createPlayerBallContactResponseEvent(
  playerContact: PlayerBallContactEvent,
  outgoingVelocity: BallVector3,
  hitTiming: PlayerHitTimingSample,
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
  }
}
