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

const STEP_COMPARISON_EPSILON = 1e-12

export interface BallSimulationAdvanceResult {
  executedSteps: number
  events: readonly BallSimulationEvent[]
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
  ): BallSimulationAdvanceResult {
    const safeFrameDeltaSeconds = getSafeFrameDeltaSeconds(frameDeltaSeconds)

    if (safeFrameDeltaSeconds === 0) {
      return { executedSteps: 0, events: [] }
    }

    if (this.groundContactOccurred) {
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
        events.push(
          ...this.detectPlayerContacts(
            stateAtImpact,
            playerContactTargets,
          ),
        )
        events.push(
          createBallGroundContactEvent(
            stateAtImpact.position,
            stateAtImpact.velocity,
          ),
        )
        this.groundContactOccurred = true
        this.accumulatedSeconds = 0
        executedSteps += 1
        this.simulationStepCount += 1
        break
      }

      this.state = stepVolleyballFreeFlight(this.state, fixedStepSeconds)
      const playerContacts = this.detectPlayerContacts(
        this.state,
        playerContactTargets,
      )
      events.push(...playerContacts)

      const respondingContact = playerContacts[0]

      if (respondingContact) {
        // Temporary sandbox priority: only the first new contact in the stable
        // target order may respond during a fixed step.
        this.state = applyPlayerContactResponse(
          this.state,
          respondingContact,
        )
        events.push(
          createPlayerBallContactResponseEvent(
            respondingContact,
            this.state.velocity,
          ),
        )
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

  private detectPlayerContacts(
    ballState: VolleyballState,
    playerContactTargets: readonly PlayerBallContactTarget[],
  ): PlayerBallContactEvent[] {
    // F2.4 samples overlap at fixed-step states. Swept/continuous collision can
    // replace this detector later without changing the PLAYER_CONTACT contract.
    const currentContactIds = new Set<string>()
    const events: PlayerBallContactEvent[] = []

    for (const target of playerContactTargets) {
      if (!isBallOverlappingPlayer(ballState.position, target)) {
        continue
      }

      currentContactIds.add(target.playerId)

      if (!this.activePlayerContactIds.has(target.playerId)) {
        events.push(createPlayerBallContactEvent(ballState, target))
      }
    }

    this.activePlayerContactIds = currentContactIds

    return events
  }

  reset(state: VolleyballState): void {
    this.state = copyVolleyballState(state)
    this.accumulatedSeconds = 0
    this.simulationStepCount = 0
    this.groundContactOccurred = false
    this.activePlayerContactIds.clear()
  }
}
