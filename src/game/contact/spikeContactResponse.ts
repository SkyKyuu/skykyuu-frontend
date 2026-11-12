import type { BallVector3 } from '@/game/ball/volleyballState'
import type { PlayerBallContactEvent } from '@/game/contact/playerBallContact'
import { createPlayerHitTimingSample } from '@/game/contact/playerHitTiming'
import { getPlayerHitTimingAccuracyMultiplier } from '@/game/contact/playerHitTimingAccuracy'
import { getPlayerHitTimingEffectiveAimForward, getPlayerHitTimingEffectiveAimLateral } from '@/game/contact/playerHitTimingAccuracyAim'
import { classifyPlayerHitTiming, type PlayerHitTimingGrade } from '@/game/contact/playerHitTimingGrade'
import { getPlayerHitTimingForwardMultiplier } from '@/game/contact/playerHitTimingPower'
import { solveSpikeBallisticCorridor, type SpikeTrajectory } from '@/game/contact/spikeBallisticCorridor'
import { SPIKE_PHYSICS_CONFIG as config } from '@/game/contact/spikePhysicsConfig'
import { INDOOR_NET } from '@/game/net/indoorNetDimensions'
import type { TeamSide } from '@/game/team/teamTypes'

export type PlayerSpikeResponseEvent = SpikeTrajectory & Readonly<{
  type: 'PLAYER_SPIKE_RESPONSE'
  actionType: 'SPIKE'
  playerId: string
  teamSide: TeamSide
  pressStep: number
  contactStep: number
  responseStep: number
  ballPosition: Readonly<BallVector3>
  incomingVelocity: Readonly<BallVector3>
  outgoingVelocity: Readonly<BallVector3>
  timingOffsetSteps: number
  timingOffsetSeconds: number
  timingGrade: PlayerHitTimingGrade
  timingPowerMultiplier: number
  timingAccuracyMultiplier: number
  aimLateral: number
  aimForward: number
  effectiveAimLateral: number
  effectiveAimForward: number
}>

export function createSpikeContactResponse(
  contact: PlayerBallContactEvent,
  pressStep: number,
  contactStep: number,
  responseStep: number,
  fixedStepSeconds: number,
  aimLateral: number,
  aimForward: number,
): PlayerSpikeResponseEvent {
  const timing = createPlayerHitTimingSample(pressStep, contactStep, fixedStepSeconds)
  const timingGrade = classifyPlayerHitTiming(timing.offsetSteps)
  const timingPowerMultiplier = getPlayerHitTimingForwardMultiplier(timingGrade)
  const timingAccuracyMultiplier = getPlayerHitTimingAccuracyMultiplier(timingGrade)
  const effectiveAimLateral = getPlayerHitTimingEffectiveAimLateral(aimLateral, timingAccuracyMultiplier)
  const effectiveAimForward = getPlayerHitTimingEffectiveAimForward(aimForward, timingAccuracyMultiplier)
  const sideSign = contact.teamSide === 'A' ? 1 : -1
  const forwardSpeed = config.baseForwardVelocity * timingPowerMultiplier
    + config.maxForwardContribution * effectiveAimForward
  const trajectory = solveSpikeBallisticCorridor(
    contact.ballPosition.y, sideSign * (INDOOR_NET.z - contact.ballPosition.z), forwardSpeed,
  )
  const outgoingVelocity = Object.freeze({
    x: config.incomingXRetention * contact.ballVelocity.x + sideSign * config.maxLateralContribution * effectiveAimLateral,
    y: trajectory.trajectoryMode === 'MODEL_C'
      ? trajectory.corridor.selectedVy : config.baseVerticalVelocity * timingPowerMultiplier,
    z: sideSign * forwardSpeed,
  })
  if (!Number.isFinite(outgoingVelocity.x)) throw new RangeError('SPIKE requires finite incoming X velocity')

  return Object.freeze({
    ...trajectory,
    type: 'PLAYER_SPIKE_RESPONSE',
    actionType: 'SPIKE',
    playerId: contact.playerId,
    teamSide: contact.teamSide,
    pressStep,
    contactStep,
    responseStep,
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
