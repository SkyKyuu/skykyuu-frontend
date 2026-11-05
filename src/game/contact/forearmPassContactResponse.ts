import type { BallVector3 } from '@/game/ball/volleyballState'
import { FOREARM_PASS_PHYSICS_CONFIG as config } from '@/game/contact/forearmPassPhysicsConfig'
import type { PlayerBallContactEvent } from '@/game/contact/playerBallContact'
import { createPlayerHitTimingSample } from '@/game/contact/playerHitTiming'
import { getPlayerHitTimingAccuracyMultiplier } from '@/game/contact/playerHitTimingAccuracy'
import { getPlayerHitTimingEffectiveAimForward, getPlayerHitTimingEffectiveAimLateral } from '@/game/contact/playerHitTimingAccuracyAim'
import { classifyPlayerHitTiming, type PlayerHitTimingGrade } from '@/game/contact/playerHitTimingGrade'
import { getPlayerHitTimingForwardMultiplier } from '@/game/contact/playerHitTimingPower'
import type { TeamSide } from '@/game/team/teamTypes'

export interface PlayerForearmPassResponseEvent {
  readonly type: 'PLAYER_FOREARM_PASS_RESPONSE'
  readonly actionType: 'FOREARM_PASS'
  readonly playerId: string
  readonly teamSide: TeamSide
  readonly pressStep: number
  /** Entry step of this continuous overlap, which is the reference for timing. */
  readonly contactStep: number
  readonly ballPosition: Readonly<BallVector3>
  readonly incomingVelocity: Readonly<BallVector3>
  readonly outgoingVelocity: Readonly<BallVector3>
  readonly timingOffsetSteps: number
  readonly timingOffsetSeconds: number
  readonly timingGrade: PlayerHitTimingGrade
  readonly timingPowerMultiplier: number
  readonly timingAccuracyMultiplier: number
  readonly aimLateral: number
  readonly aimForward: number
  readonly effectiveAimLateral: number
  readonly effectiveAimForward: number
}

/** Computes the response before committing it to simulation state. */
export function createForearmPassContactResponse(
  contact: PlayerBallContactEvent,
  pressStep: number,
  contactStep: number,
  fixedStepSeconds: number,
  aimLateral: number,
  aimForward: number,
): PlayerForearmPassResponseEvent {
  const timing = createPlayerHitTimingSample(pressStep, contactStep, fixedStepSeconds)
  const timingGrade = classifyPlayerHitTiming(timing.offsetSteps)
  const timingPowerMultiplier = getPlayerHitTimingForwardMultiplier(timingGrade)
  const timingAccuracyMultiplier = getPlayerHitTimingAccuracyMultiplier(timingGrade)
  const effectiveAimLateral = getPlayerHitTimingEffectiveAimLateral(aimLateral, timingAccuracyMultiplier)
  const effectiveAimForward = getPlayerHitTimingEffectiveAimForward(aimForward, timingAccuracyMultiplier)
  const sideSign = contact.teamSide === 'A' ? 1 : -1
  const outgoingVelocity = Object.freeze({
    x: contact.ballVelocity.x + sideSign * effectiveAimLateral * config.maxLateralVelocityContribution,
    y: config.upwardVelocity,
    z: sideSign * (config.forwardVelocity * timingPowerMultiplier + effectiveAimForward * config.maxForwardVelocityContribution),
  })

  return Object.freeze({
    type: 'PLAYER_FOREARM_PASS_RESPONSE',
    actionType: 'FOREARM_PASS',
    playerId: contact.playerId,
    teamSide: contact.teamSide,
    pressStep,
    contactStep,
    ballPosition: Object.freeze({ ...contact.ballPosition }),
    incomingVelocity: Object.freeze({ ...contact.ballVelocity }),
    outgoingVelocity,
    timingOffsetSteps: timing.offsetSteps,
    timingOffsetSeconds: timing.offsetSeconds,
    timingGrade,
    timingPowerMultiplier,
    timingAccuracyMultiplier,
    aimLateral,
    aimForward,
    effectiveAimLateral,
    effectiveAimForward,
  })
}
