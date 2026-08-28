import {
  copyVolleyballState,
  type VolleyballState,
} from '@/game/ball/volleyballState'
import { VOLLEYBALL_SIMULATION_CONFIG } from '@/game/ball/volleyballSimulationConfig'
import { stepVolleyballFreeFlight } from '@/game/ball/volleyballSimulationMath'

const STEP_COMPARISON_EPSILON = 1e-12

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

  advance(frameDeltaSeconds: number): number {
    const safeFrameDeltaSeconds = getSafeFrameDeltaSeconds(frameDeltaSeconds)

    if (safeFrameDeltaSeconds === 0) {
      return 0
    }

    const { fixedStepSeconds, maxSubSteps } = VOLLEYBALL_SIMULATION_CONFIG
    this.accumulatedSeconds += safeFrameDeltaSeconds

    let executedSteps = 0

    while (
      this.accumulatedSeconds + STEP_COMPARISON_EPSILON >=
        fixedStepSeconds &&
      executedSteps < maxSubSteps
    ) {
      this.state = stepVolleyballFreeFlight(this.state, fixedStepSeconds)
      this.accumulatedSeconds -= fixedStepSeconds
      executedSteps += 1
      this.simulationStepCount += 1
    }

    if (Math.abs(this.accumulatedSeconds) < STEP_COMPARISON_EPSILON) {
      this.accumulatedSeconds = 0
    }

    return executedSteps
  }

  reset(state: VolleyballState): void {
    this.state = copyVolleyballState(state)
    this.accumulatedSeconds = 0
    this.simulationStepCount = 0
  }
}
