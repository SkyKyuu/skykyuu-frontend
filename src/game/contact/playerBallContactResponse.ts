import type {
  BallVector3,
  VolleyballState,
} from '@/game/ball/volleyballState'
import type { PlayerBallContactEvent } from '@/game/contact/playerBallContact'
import { PLAYER_CONTACT_RESPONSE_CONFIG } from '@/game/contact/playerBallContactResponseConfig'
import {
  getPlayerHitAimVelocityX,
  getPlayerHitAimVelocityZ,
  playerHitAimForwardToWorldZ,
} from '@/game/contact/playerHitAimMath'
import type { PlayerHitTimingSample } from '@/game/contact/playerHitTiming'
import type { PlayerHitTimingGrade } from '@/game/contact/playerHitTimingGrade'
import {
  getPlayerHitTimingEffectiveAimLateral,
  getPlayerHitTimingEffectiveAimForward,
} from '@/game/contact/playerHitTimingAccuracyAim'
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
  /** Raw player-local forward aim captured at hit press. */
  hitAimForward: number
  /** Accuracy-adjusted player-local forward intention. */
  hitEffectiveAimForward: number
  /** Effective forward intention converted to world Z. */
  hitEffectiveAimWorldZ: number
  /** Forward aim velocity contribution added to the timing-powered forward base. */
  hitAimVelocityZ: number
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
  hitAimForward = 0,
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
  const hitEffectiveAimForward = getPlayerHitTimingEffectiveAimForward(
    hitAimForward,
    hitTimingAccuracyMultiplier,
  )
  const aimVelocityZ = getPlayerHitAimVelocityZ(teamSide, hitEffectiveAimForward)
  const baseForwardWorldZ = teamSide === 'A' ? forwardMagnitude : -forwardMagnitude

  return {
    x: incomingVelocity.x + aimVelocityX,
    y: PLAYER_CONTACT_RESPONSE_CONFIG.upwardVelocity,
    z: baseForwardWorldZ + aimVelocityZ,
  }
}

export function applyPlayerContactResponse(
  state: VolleyballState,
  playerContact: PlayerBallContactEvent,
  hitTimingGrade: PlayerHitTimingGrade,
  hitAimLateral: number,
  hitTimingAccuracyMultiplier: number,
  hitAimForward = 0,
): VolleyballState {
  return {
    position: { ...state.position },
    velocity: getPlayerContactResponseVelocity(
      state.velocity,
      playerContact.teamSide,
      hitTimingGrade,
      hitAimLateral,
      hitTimingAccuracyMultiplier,
      hitAimForward,
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
  hitAimForward: number,
): PlayerBallContactResponseEvent {
  const hitEffectiveAimForward = getPlayerHitTimingEffectiveAimForward(
    hitAimForward,
    hitTimingAccuracyMultiplier,
  )

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
    hitAimForward,
    hitEffectiveAimForward,
    hitEffectiveAimWorldZ: playerHitAimForwardToWorldZ(
      playerContact.teamSide,
      hitEffectiveAimForward,
    ),
    hitAimVelocityZ: getPlayerHitAimVelocityZ(
      playerContact.teamSide,
      hitEffectiveAimForward,
    ),
    hitAimWorldX,
    hitEffectiveAimLateral,
    hitEffectiveAimWorldX,
    hitAimVelocityX,
  }
}
