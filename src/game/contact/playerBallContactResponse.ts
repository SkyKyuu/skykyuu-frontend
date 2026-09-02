import type {
  BallVector3,
  VolleyballState,
} from '@/game/ball/volleyballState'
import type { PlayerBallContactEvent } from '@/game/contact/playerBallContact'
import { PLAYER_CONTACT_RESPONSE_CONFIG } from '@/game/contact/playerBallContactResponseConfig'
import { getPlayerHitAimVelocityX } from '@/game/contact/playerHitAimMath'
import type { PlayerHitTimingSample } from '@/game/contact/playerHitTiming'
import type { PlayerHitTimingGrade } from '@/game/contact/playerHitTimingGrade'
import { getPlayerHitTimingEffectiveAimLateral } from '@/game/contact/playerHitTimingAccuracyAim'
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
  hitTimingAccuracyMultiplier: number
  /** Player-local lateral aim captured at hit press; not world X. */
  hitAimLateral: number
  /** Player-local lateral aim converted to world X. */
  hitAimWorldX: number
  /** Player-local lateral aim after timing accuracy is applied. */
  hitEffectiveAimLateral: number
  /** Accuracy-adjusted lateral aim converted to world X. */
  hitEffectiveAimWorldX: number
  /** Lateral velocity contribution applied to the incoming ball velocity. */
  hitAimVelocityX: number
}

export function getPlayerContactResponseVelocity(
  incomingVelocity: BallVector3,
  teamSide: TeamSide,
  hitTimingGrade: PlayerHitTimingGrade,
  hitAimLateral: number,
  hitTimingAccuracyMultiplier: number,
): BallVector3 {
  const forwardMagnitude =
    PLAYER_CONTACT_RESPONSE_CONFIG.forwardVelocity *
    getPlayerHitTimingForwardMultiplier(hitTimingGrade)
  const hitEffectiveAimLateral = getPlayerHitTimingEffectiveAimLateral(
    hitAimLateral,
    hitTimingAccuracyMultiplier,
  )
  const aimVelocityX = getPlayerHitAimVelocityX(
    teamSide,
    hitEffectiveAimLateral,
  )

  return {
    x: incomingVelocity.x + aimVelocityX,
    y: PLAYER_CONTACT_RESPONSE_CONFIG.upwardVelocity,
    z: teamSide === 'A' ? forwardMagnitude : -forwardMagnitude,
  }
}

export function applyPlayerContactResponse(
  state: VolleyballState,
  playerContact: PlayerBallContactEvent,
  hitTimingGrade: PlayerHitTimingGrade,
  hitAimLateral: number,
  hitTimingAccuracyMultiplier: number,
): VolleyballState {
  return {
    position: { ...state.position },
    velocity: getPlayerContactResponseVelocity(
      state.velocity,
      playerContact.teamSide,
      hitTimingGrade,
      hitAimLateral,
      hitTimingAccuracyMultiplier,
    ),
  }
}

export function createPlayerBallContactResponseEvent(
  playerContact: PlayerBallContactEvent,
  outgoingVelocity: BallVector3,
  hitTiming: PlayerHitTimingSample,
  hitTimingGrade: PlayerHitTimingGrade,
  hitTimingForwardMultiplier: number,
  hitTimingAccuracyMultiplier: number,
  hitAimLateral: number,
  hitAimWorldX: number,
  hitEffectiveAimLateral: number,
  hitEffectiveAimWorldX: number,
  hitAimVelocityX: number,
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
    hitTimingAccuracyMultiplier,
    hitAimLateral,
    hitAimWorldX,
    hitEffectiveAimLateral,
    hitEffectiveAimWorldX,
    hitAimVelocityX,
  }
}
