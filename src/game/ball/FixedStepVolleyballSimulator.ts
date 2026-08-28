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

  advance(frameDeltaSeconds: number): BallSimulationAdvanceResult {
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
      this.accumulatedSeconds -= fixedStepSeconds
      executedSteps += 1
      this.simulationStepCount += 1
    }

    if (Math.abs(this.accumulatedSeconds) < STEP_COMPARISON_EPSILON) {
      this.accumulatedSeconds = 0
    }

    return { executedSteps, events }
  }

  reset(state: VolleyballState): void {
    this.state = copyVolleyballState(state)
    this.accumulatedSeconds = 0
    this.simulationStepCount = 0
    this.groundContactOccurred = false
  }
}
