import type { BallVector3 } from '@/game/ball/volleyballState'
import type { PlayerBallContactEvent } from '@/game/contact/playerBallContact'
import { createPlayerHitTimingSample } from '@/game/contact/playerHitTiming'
import { classifyPlayerHitTiming, type PlayerHitTimingGrade } from '@/game/contact/playerHitTimingGrade'
import type { AdmissibleTipTrajectory } from '@/game/contact/tipBallisticSolver'
import type { TeamSide } from '@/game/team/teamTypes'

export interface PlayerTipResponseEvent {
  readonly type: 'PLAYER_TIP_RESPONSE'
  readonly actionType: 'TIP'
  readonly playerId: string
  readonly teamSide: TeamSide
  readonly pressStep: number
  readonly contactStep: number
  readonly responseStep: number
  readonly ballPosition: Readonly<BallVector3>
  readonly incomingVelocity: Readonly<BallVector3>
  readonly outgoingVelocity: Readonly<BallVector3>
  readonly aimLateral: number
  readonly aimForward: number
  readonly timingOffsetSteps: number
  readonly timingOffsetSeconds: number
  readonly timingGrade: PlayerHitTimingGrade
  readonly targetPosition: Readonly<BallVector3>
  readonly flightTimeSeconds: number
  readonly admissibleTimeInterval: Readonly<{ min: number; max: number }>
  readonly initialSpeed: number
  readonly apexHeight: number
  readonly netEntryClearance: number
  readonly netExitClearance: number
}

/** Uses the exact already-validated plan; timing and incoming velocity are telemetry only. */
export function createTipContactResponse(
  contact: PlayerBallContactEvent,
  pressStep: number,
  contactStep: number,
  responseStep: number,
  fixedStepSeconds: number,
  aimLateral: number,
  aimForward: number,
  trajectory: AdmissibleTipTrajectory,
): PlayerTipResponseEvent {
  const timing = createPlayerHitTimingSample(pressStep, contactStep, fixedStepSeconds)
  return Object.freeze({
    type: 'PLAYER_TIP_RESPONSE',
    actionType: 'TIP',
    playerId: contact.playerId,
    teamSide: contact.teamSide,
    pressStep,
    contactStep,
    responseStep,
    ballPosition: Object.freeze({ ...contact.ballPosition }),
    incomingVelocity: Object.freeze({ ...contact.ballVelocity }),
    outgoingVelocity: Object.freeze({ ...trajectory.outgoingVelocity }),
    aimLateral,
    aimForward,
    timingOffsetSteps: timing.offsetSteps,
    timingOffsetSeconds: timing.offsetSeconds,
    timingGrade: classifyPlayerHitTiming(timing.offsetSteps),
    targetPosition: Object.freeze({ ...trajectory.targetPosition }),
    flightTimeSeconds: trajectory.selectedFlightTime,
    admissibleTimeInterval: Object.freeze({ ...trajectory.admissibleTimeInterval }),
    initialSpeed: trajectory.initialSpeed,
    apexHeight: trajectory.apexHeight,
    netEntryClearance: trajectory.netEntryClearance,
    netExitClearance: trajectory.netExitClearance,
  })
}
