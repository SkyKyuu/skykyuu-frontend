import {
  copyVolleyballState,
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
} from '@/game/contact/playerBallContactResponse'
import { PLAYER_HIT_BUFFER_CONFIG } from '@/game/contact/playerHitBufferConfig'
import {
  validatePlayerHitAimForward,
  validatePlayerHitAimLateral,
} from '@/game/contact/playerHitAim'
import {
  getPlayerHitAimVelocityX,
  playerHitAimLateralToWorldX,
} from '@/game/contact/playerHitAimMath'
import type { PlayerHitIntent } from '@/game/contact/playerHitIntent'
import {
  createPlayerHitTimingSample,
  type PlayerHitTimingSample,
} from '@/game/contact/playerHitTiming'
import { classifyPlayerHitTiming } from '@/game/contact/playerHitTimingGrade'
import { getPlayerHitTimingAccuracyMultiplier } from '@/game/contact/playerHitTimingAccuracy'
import { getPlayerHitTimingEffectiveAimLateral } from '@/game/contact/playerHitTimingAccuracyAim'
import { getPlayerHitTimingForwardMultiplier } from '@/game/contact/playerHitTimingPower'

const STEP_COMPARISON_EPSILON = 1e-12

export interface BallSimulationAdvanceResult {
  executedSteps: number
  events: readonly BallSimulationEvent[]
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

  advance(
    frameDeltaSeconds: number,
    playerContactTargets: readonly PlayerBallContactTarget[] = [],
    playerHitIntents: readonly PlayerHitIntent[] = [],
  ): BallSimulationAdvanceResult {
    if (this.groundContactOccurred) {
      return { executedSteps: 0, events: [] }
    }

    this.armPlayerHitBuffers(playerHitIntents)

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

      this.discardBuffersForRespondedOverlaps(overlappingTargets)

      const respondingTarget = overlappingTargets.find((target) => {
        const remainingBufferSeconds =
          this.hitBufferRemainingSecondsByPlayer.get(target.playerId) ?? 0

        return (
          remainingBufferSeconds > 0 &&
          !this.respondedPlayerContactIds.has(target.playerId)
        )
      })

      if (respondingTarget) {
        const hitTiming = this.createResponseHitTiming(
          respondingTarget.playerId,
          fixedStepSeconds,
        )
        const hitTimingGrade = classifyPlayerHitTiming(
          hitTiming.offsetSteps,
        )
        const hitTimingForwardMultiplier =
          getPlayerHitTimingForwardMultiplier(hitTimingGrade)
        const hitTimingAccuracyMultiplier =
          getPlayerHitTimingAccuracyMultiplier(hitTimingGrade)
        const hitAimLateral = this.getResponseHitAimLateral(
          respondingTarget.playerId,
        )
        const hitAimForward = this.getResponseHitAimForward(
          respondingTarget.playerId,
        )
        const respondingContact = createPlayerBallContactEvent(
          this.state,
          respondingTarget,
        )
        const hitAimWorldX = playerHitAimLateralToWorldX(
          respondingContact.teamSide,
          hitAimLateral,
        )
        const hitEffectiveAimLateral =
          getPlayerHitTimingEffectiveAimLateral(
            hitAimLateral,
            hitTimingAccuracyMultiplier,
          )
        const hitEffectiveAimWorldX = playerHitAimLateralToWorldX(
          respondingContact.teamSide,
          hitEffectiveAimLateral,
        )
        const hitAimVelocityX = getPlayerHitAimVelocityX(
          respondingContact.teamSide,
          hitEffectiveAimLateral,
        )
        this.state = applyPlayerContactResponse(
          this.state,
          respondingContact,
          hitTimingGrade,
          hitAimLateral,
          hitTimingAccuracyMultiplier,
        )
        const responseEvent = createPlayerBallContactResponseEvent(
          respondingContact,
          this.state.velocity,
          hitTiming,
          hitTimingGrade,
          hitTimingForwardMultiplier,
          hitTimingAccuracyMultiplier,
          hitAimLateral,
          hitAimForward,
          hitAimWorldX,
          hitEffectiveAimLateral,
          hitEffectiveAimWorldX,
          hitAimVelocityX,
        )
        this.respondedPlayerContactIds.add(respondingTarget.playerId)
        this.hitBufferRemainingSecondsByPlayer.delete(
          respondingTarget.playerId,
        )
        this.hitPressStepByPlayer.delete(respondingTarget.playerId)
        this.hitAimLateralByPlayer.delete(respondingTarget.playerId)
        this.hitAimForwardByPlayer.delete(respondingTarget.playerId)
        events.push(responseEvent)
      }

      this.decayPlayerHitBuffers(fixedStepSeconds)

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

  private createResponseHitTiming(
    playerId: string,
    fixedStepSeconds: number,
  ): PlayerHitTimingSample {
    const pressStep = this.hitPressStepByPlayer.get(playerId)
    const contactEntryStep = this.contactEntryStepByPlayer.get(playerId)

    if (pressStep === undefined || contactEntryStep === undefined) {
      throw new Error(
        `Missing hit timing state for eligible player: ${playerId}`,
      )
    }

    return createPlayerHitTimingSample(
      pressStep,
      contactEntryStep,
      fixedStepSeconds,
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
    this.activePlayerContactIds.clear()
    this.respondedPlayerContactIds.clear()
    this.hitBufferRemainingSecondsByPlayer.clear()
    this.hitPressStepByPlayer.clear()
    this.hitAimLateralByPlayer.clear()
    this.hitAimForwardByPlayer.clear()
    this.contactEntryStepByPlayer.clear()
  }
}
