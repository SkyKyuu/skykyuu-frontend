import { isPlayerCommandPressed, PlayerActionResolver, type PendingPlayerAction, type PlayerCommandIntent } from '@/game/actions/playerActionResolver'
import {
  copyVolleyballState,
  type BallVector3,
  type VolleyballState,
} from '@/game/ball/volleyballState'
import {
  createBallGroundContactEvent,
  type BallSimulationEvent,
} from '@/game/ball/ballGroundContact'
import { VOLLEYBALL_CONFIG } from '@/game/ball/volleyballConfig'
import { VOLLEYBALL_SIMULATION_CONFIG } from '@/game/ball/volleyballSimulationConfig'
import {
  findGroundContactTime,
  stepVolleyballFreeFlight,
} from '@/game/ball/volleyballSimulationMath'
import {
  createPlayerBallContactEvent,
  isBallOverlappingPlayer,
  type PlayerBallContactEvent,
  type PlayerBallContactTarget,
} from '@/game/contact/playerBallContact'
import {
  applyPlayerContactResponse,
  createPlayerBallContactResponseEvent,
  type PlayerBallContactResponseEvent,
} from '@/game/contact/playerBallContactResponse'
import { createForearmPassContactResponse, type PlayerForearmPassResponseEvent } from '@/game/contact/forearmPassContactResponse'
import { PLAYER_HIT_BUFFER_CONFIG } from '@/game/contact/playerHitBufferConfig'
import {
  validatePlayerHitAimLateral,
  validatePlayerHitAimForward,
} from '@/game/contact/playerHitAim'
import {
  getPlayerHitAimVelocityX,
  playerHitAimLateralToWorldX,
} from '@/game/contact/playerHitAimMath'
import type { PlayerHitIntent } from '@/game/contact/playerHitIntent'
import {
  createPlayerHitTimingSample,
} from '@/game/contact/playerHitTiming'
import { classifyPlayerHitTiming, type PlayerHitTimingGrade } from '@/game/contact/playerHitTimingGrade'
import { getPlayerHitTimingAccuracyMultiplier } from '@/game/contact/playerHitTimingAccuracy'
import { getPlayerHitTimingEffectiveAimLateral } from '@/game/contact/playerHitTimingAccuracyAim'
import { getPlayerHitTimingForwardMultiplier } from '@/game/contact/playerHitTimingPower'
import { createSetContactResponse, type PlayerSetResponseEvent } from '@/game/contact/setContactResponse'

const STEP_COMPARISON_EPSILON = 1e-12

export interface BallSimulationAdvanceResult {
  executedSteps: number
  events: readonly BallSimulationEvent[]
}

export interface ExecutedPlayerAction {
  readonly action: PendingPlayerAction
  readonly responseStep: number
  readonly timingGrade: PlayerHitTimingGrade
  readonly outgoingVelocity: Readonly<BallVector3>
}

export interface ActionStepObservation {
  readonly simulationStep: number
  /** Selections before response, including commands that did not get a contact. */
  readonly selectedActions: readonly PendingPlayerAction[]
  readonly executedAction: ExecutedPlayerAction | null
}

export interface ActionSimulationAdvanceResult extends BallSimulationAdvanceResult {
  readonly actionSteps: readonly ActionStepObservation[]
  readonly lastActionStep: ActionStepObservation
}

interface PlayerContactDetectionResult {
  overlappingTargets: readonly PlayerBallContactTarget[]
  newContactEvents: readonly PlayerBallContactEvent[]
}

function getSafeFrameDeltaSeconds(frameDeltaSeconds: number): number {
  if (!Number.isFinite(frameDeltaSeconds) || frameDeltaSeconds <= 0) {
    return 0
  }

  return Math.min(
    frameDeltaSeconds,
    VOLLEYBALL_SIMULATION_CONFIG.maxFrameDeltaSeconds,
  )
}

export class FixedStepVolleyballSimulator {
  private state: VolleyballState
  private accumulatedSeconds = 0
  private simulationStepCount = 0
  private groundContactOccurred = false
  private activePlayerContactIds = new Set<string>()
  private respondedPlayerContactIds = new Set<string>()
  private hitBufferRemainingSecondsByPlayer = new Map<string, number>()
  private hitPressStepByPlayer = new Map<string, number>()
  private hitAimLateralByPlayer = new Map<string, number>()
  private hitAimForwardByPlayer = new Map<string, number>()
  private contactEntryStepByPlayer = new Map<string, number>()
  private readonly actionResolver = new PlayerActionResolver()
  private responseMode: 'legacy' | 'actions' | null = null

  constructor(initialState: VolleyballState) {
    this.state = copyVolleyballState(initialState)
  }

  get accumulatorSeconds(): number {
    return this.accumulatedSeconds
  }

  get totalSimulationSteps(): number {
    return this.simulationStepCount
  }

  getState(): VolleyballState {
    return copyVolleyballState(this.state)
  }

  /** Discard pending action edges when a player loses their input device. */
  clearPlayerActions(playerId: string): void {
    this.actionResolver.clearPlayer(playerId)
  }

  advance(
    frameDeltaSeconds: number,
    playerContactTargets: readonly PlayerBallContactTarget[] = [],
    playerHitIntents: readonly PlayerHitIntent[] = [],
  ): BallSimulationAdvanceResult {
    if (this.groundContactOccurred) {
      return { executedSteps: 0, events: [] }
    }

    this.useResponseMode('legacy')
    this.armPlayerHitBuffers(playerHitIntents)
    return this.runFixedSteps(frameDeltaSeconds, playerContactTargets)
  }

  /** Captures frame edges at totalSimulationSteps and resolves them in the fixed-step loop. */
  advanceWithActions(
    frameDeltaSeconds: number,
    playerContactTargets: readonly PlayerBallContactTarget[] = [],
    intents: readonly PlayerCommandIntent[] = [],
  ): ActionSimulationAdvanceResult {
    const actionSteps: ActionStepObservation[] = []
    if (this.groundContactOccurred) {
      return {
        executedSteps: 0, events: [], actionSteps,
        lastActionStep: { simulationStep: this.totalSimulationSteps, selectedActions: [], executedAction: null },
      }
    }

    this.useResponseMode('actions')
    const presses = intents.filter(isPlayerCommandPressed)
    // Reject malformed frame input before replacing a capture or moving the ball.
    for (const intent of presses) {
      validatePlayerHitAimLateral(intent.aimLateral)
      validatePlayerHitAimForward(intent.aimForward)
    }
    for (const intent of presses) {
      // A fresh press during a responded overlap cannot re-arm that contact.
      // Candidates captured before the response can survive until exit or expiry.
      if (!this.respondedPlayerContactIds.has(intent.playerId)) {
        this.actionResolver.capture(intent, this.totalSimulationSteps)
      }
    }

    const result = this.runFixedSteps(frameDeltaSeconds, playerContactTargets, actionSteps)
    return {
      ...result,
      actionSteps,
      lastActionStep: actionSteps.at(-1) ?? {
        simulationStep: this.totalSimulationSteps,
        selectedActions: this.actionResolver.selectAll(this.totalSimulationSteps),
        executedAction: null,
      },
    }
  }

  private useResponseMode(mode: 'legacy' | 'actions'): void {
    if (this.responseMode !== null && this.responseMode !== mode) {
      throw new Error('Reset the volleyball simulator before changing its response mode')
    }
    this.responseMode = mode
  }

  private runFixedSteps(
    frameDeltaSeconds: number,
    playerContactTargets: readonly PlayerBallContactTarget[],
    actionSteps?: ActionStepObservation[],
  ): BallSimulationAdvanceResult {

    const safeFrameDeltaSeconds = getSafeFrameDeltaSeconds(frameDeltaSeconds)

    if (safeFrameDeltaSeconds === 0) {
      return { executedSteps: 0, events: [] }
    }

    const { fixedStepSeconds, maxSubSteps } = VOLLEYBALL_SIMULATION_CONFIG
    this.accumulatedSeconds += safeFrameDeltaSeconds

    let executedSteps = 0
    const events: BallSimulationEvent[] = []

    while (
      this.accumulatedSeconds + STEP_COMPARISON_EPSILON >=
        fixedStepSeconds &&
      executedSteps < maxSubSteps
    ) {
      const contactTime = findGroundContactTime(
        this.state,
        fixedStepSeconds,
      )

      if (contactTime !== null) {
        const stateAtImpact = stepVolleyballFreeFlight(this.state, contactTime)
        stateAtImpact.position.y = VOLLEYBALL_CONFIG.radius
        this.state = stateAtImpact
        const { newContactEvents } = this.detectPlayerContacts(
          stateAtImpact,
          playerContactTargets,
        )
        events.push(...newContactEvents)
        events.push(
          createBallGroundContactEvent(
            stateAtImpact.position,
            stateAtImpact.velocity,
          ),
        )
        this.clearPendingPlayerHits()
        this.actionResolver.reset()
        actionSteps?.push({ simulationStep: this.totalSimulationSteps, selectedActions: [], executedAction: null })
        this.groundContactOccurred = true
        this.accumulatedSeconds = 0
        executedSteps += 1
        this.simulationStepCount += 1
        break
      }

      this.state = stepVolleyballFreeFlight(this.state, fixedStepSeconds)
      const { overlappingTargets, newContactEvents } =
        this.detectPlayerContacts(this.state, playerContactTargets)
      events.push(...newContactEvents)

      if (!actionSteps) this.discardBuffersForRespondedOverlaps(overlappingTargets)
      const simulationStep = this.totalSimulationSteps
      const selectedActions = actionSteps ? this.actionResolver.selectAll(simulationStep) : []
      const respondingTarget = overlappingTargets.find(({ playerId }) => (
        !this.respondedPlayerContactIds.has(playerId) && (actionSteps
          ? selectedActions.some((action) => action.playerId === playerId)
          : (this.hitBufferRemainingSecondsByPlayer.get(playerId) ?? 0) > 0)
      ))

      let executedAction: ExecutedPlayerAction | null = null
      if (respondingTarget) {
        const playerId = respondingTarget.playerId
        const action = selectedActions.find((candidate) => candidate.playerId === playerId)
        const responseEvent = this.applyResponse(respondingTarget, fixedStepSeconds, action)
        if (action) {
          if (!this.actionResolver.consume(action, simulationStep)) {
            throw new Error(`Selected action could not be consumed: ${playerId}`)
          }
          executedAction = Object.freeze({
            action,
            responseStep: simulationStep,
            timingGrade: responseEvent.type === 'PLAYER_CONTACT_RESPONSE'
              ? responseEvent.hitTimingGrade : responseEvent.timingGrade,
            outgoingVelocity: Object.freeze({ ...responseEvent.outgoingVelocity }),
          })
        } else {
          this.hitBufferRemainingSecondsByPlayer.delete(playerId)
          this.hitPressStepByPlayer.delete(playerId)
          this.hitAimLateralByPlayer.delete(playerId)
          this.hitAimForwardByPlayer.delete(playerId)
        }
        this.respondedPlayerContactIds.add(playerId)
        events.push(responseEvent)
      }

      if (actionSteps) {
        actionSteps.push({ simulationStep, selectedActions, executedAction })
      } else {
        this.decayPlayerHitBuffers(fixedStepSeconds)
      }

      this.accumulatedSeconds -= fixedStepSeconds
      executedSteps += 1
      this.simulationStepCount += 1
    }

    if (Math.abs(this.accumulatedSeconds) < STEP_COMPARISON_EPSILON) {
      this.accumulatedSeconds = 0
    }

    return { executedSteps, events }
  }

  private armPlayerHitBuffers(
    playerHitIntents: readonly PlayerHitIntent[],
  ): void {
    for (const intent of playerHitIntents) {
      if (!intent.hitPressed) {
        continue
      }

      const aimLateral = validatePlayerHitAimLateral(intent.aimLateral)
      const aimForward = validatePlayerHitAimForward(intent.aimForward)

      const isConsumedOverlap =
        this.respondedPlayerContactIds.has(intent.playerId) &&
        this.activePlayerContactIds.has(intent.playerId)

      if (isConsumedOverlap) {
        this.hitBufferRemainingSecondsByPlayer.delete(intent.playerId)
        this.hitPressStepByPlayer.delete(intent.playerId)
        this.hitAimLateralByPlayer.delete(intent.playerId)
        this.hitAimForwardByPlayer.delete(intent.playerId)
        continue
      }

      this.hitBufferRemainingSecondsByPlayer.set(
        intent.playerId,
        PLAYER_HIT_BUFFER_CONFIG.durationSeconds,
      )
      this.hitPressStepByPlayer.set(
        intent.playerId,
        this.simulationStepCount,
      )
      this.hitAimLateralByPlayer.set(intent.playerId, aimLateral)
      this.hitAimForwardByPlayer.set(intent.playerId, aimForward)
    }
  }

  private discardBuffersForRespondedOverlaps(
    overlappingTargets: readonly PlayerBallContactTarget[],
  ): void {
    for (const target of overlappingTargets) {
      if (this.respondedPlayerContactIds.has(target.playerId)) {
        this.hitBufferRemainingSecondsByPlayer.delete(target.playerId)
        this.hitPressStepByPlayer.delete(target.playerId)
        this.hitAimLateralByPlayer.delete(target.playerId)
        this.hitAimForwardByPlayer.delete(target.playerId)
      }
    }
  }

  private decayPlayerHitBuffers(fixedStepSeconds: number): void {
    for (const [playerId, remainingSeconds] of
      this.hitBufferRemainingSecondsByPlayer) {
      const nextRemainingSeconds = remainingSeconds - fixedStepSeconds

      if (nextRemainingSeconds <= STEP_COMPARISON_EPSILON) {
        this.hitBufferRemainingSecondsByPlayer.delete(playerId)
        this.hitPressStepByPlayer.delete(playerId)
        this.hitAimLateralByPlayer.delete(playerId)
        this.hitAimForwardByPlayer.delete(playerId)
      } else {
        this.hitBufferRemainingSecondsByPlayer.set(
          playerId,
          nextRemainingSeconds,
        )
      }
    }
  }

  private clearPendingPlayerHits(): void {
    this.hitBufferRemainingSecondsByPlayer.clear()
    this.hitPressStepByPlayer.clear()
    this.hitAimLateralByPlayer.clear()
    this.hitAimForwardByPlayer.clear()
  }

  private detectPlayerContacts(
    ballState: VolleyballState,
    playerContactTargets: readonly PlayerBallContactTarget[],
  ): PlayerContactDetectionResult {
    // F2.4 samples overlap at fixed-step states. Swept/continuous collision can
    // replace this detector later without changing the PLAYER_CONTACT contract.
    const currentContactIds = new Set<string>()
    const overlappingTargets: PlayerBallContactTarget[] = []
    const events: PlayerBallContactEvent[] = []

    for (const target of playerContactTargets) {
      if (!isBallOverlappingPlayer(ballState.position, target)) {
        continue
      }

      currentContactIds.add(target.playerId)
      overlappingTargets.push(target)

      if (!this.activePlayerContactIds.has(target.playerId)) {
        events.push(createPlayerBallContactEvent(ballState, target))
        this.contactEntryStepByPlayer.set(
          target.playerId,
          this.simulationStepCount,
        )
      }
    }

    for (const activePlayerId of this.activePlayerContactIds) {
      if (!currentContactIds.has(activePlayerId)) {
        this.contactEntryStepByPlayer.delete(activePlayerId)
      }
    }

    for (const respondedPlayerId of this.respondedPlayerContactIds) {
      if (!currentContactIds.has(respondedPlayerId)) {
        this.respondedPlayerContactIds.delete(respondedPlayerId)
      }
    }

    this.activePlayerContactIds = currentContactIds

    return { overlappingTargets, newContactEvents: events }
  }

  private applyResponse(
    target: PlayerBallContactTarget,
    fixedStepSeconds: number,
    action?: PendingPlayerAction,
  ): PlayerBallContactResponseEvent | PlayerForearmPassResponseEvent | PlayerSetResponseEvent {
    const { playerId } = target
    const pressStep = action?.pressStep ?? this.hitPressStepByPlayer.get(playerId)
    const contactEntryStep = this.contactEntryStepByPlayer.get(playerId)

    if (pressStep === undefined || contactEntryStep === undefined) {
      throw new Error(
        `Missing hit timing state for eligible player: ${playerId}`,
      )
    }

    const respondingContact = createPlayerBallContactEvent(this.state, target)
    const hitAimLateral = action?.aimLateral ?? this.getResponseHitAimLateral(playerId)
    const hitAimForward = action?.aimForward ?? this.getResponseHitAimForward(playerId)
    switch (action?.actionType) {
      case 'SET':
      case 'FOREARM_PASS': {
        const createResponse = action.actionType === 'SET'
          ? createSetContactResponse : createForearmPassContactResponse
        const response = createResponse(
          respondingContact, pressStep, contactEntryStep, fixedStepSeconds, hitAimLateral, hitAimForward,
        )
        this.state = { position: { ...this.state.position }, velocity: { ...response.outgoingVelocity } }
        return response
      }
      case 'GENERIC_HIT':
      case undefined:
        break
    }

    const hitTiming = createPlayerHitTimingSample(pressStep, contactEntryStep, fixedStepSeconds)
    const hitTimingGrade = classifyPlayerHitTiming(hitTiming.offsetSteps)
    const hitTimingForwardMultiplier = getPlayerHitTimingForwardMultiplier(hitTimingGrade)
    const hitTimingAccuracyMultiplier = getPlayerHitTimingAccuracyMultiplier(hitTimingGrade)
    const hitAimWorldX = playerHitAimLateralToWorldX(target.teamSide, hitAimLateral)
    const hitEffectiveAimLateral = getPlayerHitTimingEffectiveAimLateral(hitAimLateral, hitTimingAccuracyMultiplier)
    const hitEffectiveAimWorldX = playerHitAimLateralToWorldX(target.teamSide, hitEffectiveAimLateral)
    const hitAimVelocityX = getPlayerHitAimVelocityX(target.teamSide, hitEffectiveAimLateral)
    this.state = applyPlayerContactResponse(
      this.state, respondingContact, hitTimingGrade, hitAimLateral, hitTimingAccuracyMultiplier, hitAimForward,
    )
    return createPlayerBallContactResponseEvent(
      respondingContact, this.state.velocity, hitTiming, hitTimingGrade,
      hitTimingForwardMultiplier, hitTimingAccuracyMultiplier, hitAimLateral,
      hitAimWorldX, hitEffectiveAimLateral, hitEffectiveAimWorldX, hitAimVelocityX, hitAimForward,
    )
  }

  private getResponseHitAimLateral(playerId: string): number {
    const aimLateral = this.hitAimLateralByPlayer.get(playerId)

    if (aimLateral === undefined) {
      throw new Error(
        `Missing hit aim lateral for eligible player: ${playerId}`,
      )
    }

    return aimLateral
  }

  private getResponseHitAimForward(playerId: string): number {
    const aimForward = this.hitAimForwardByPlayer.get(playerId)

    if (aimForward === undefined) {
      throw new Error(
        `Missing hit aim forward for eligible player: ${playerId}`,
      )
    }

    return aimForward
  }

  reset(state: VolleyballState): void {
    this.state = copyVolleyballState(state)
    this.accumulatedSeconds = 0
    this.simulationStepCount = 0
    this.groundContactOccurred = false
    this.responseMode = null
    this.actionResolver.reset()
    this.activePlayerContactIds.clear()
    this.respondedPlayerContactIds.clear()
    this.hitBufferRemainingSecondsByPlayer.clear()
    this.hitPressStepByPlayer.clear()
    this.hitAimLateralByPlayer.clear()
    this.hitAimForwardByPlayer.clear()
    this.contactEntryStepByPlayer.clear()
  }
}
