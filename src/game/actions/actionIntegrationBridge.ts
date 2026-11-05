import { createForearmPassIntent } from '@/game/actions/forearmPassIntent'
import { createPlayerActionIntent } from '@/game/actions/playerActionIntent'
import { PlayerActionResolver, type ResolvableActionType } from '@/game/actions/playerActionResolver'
import { createPlayerHitIntent } from '@/game/contact/playerHitIntent'
import type { LocalPlayerInputSnapshot } from '@/game/input/inputTypes'

export interface ShadowActionSnapshot {
  readonly playerId: string
  readonly simulationStep: number
  readonly selectedActionType: ResolvableActionType | null
  readonly pressStep: number | null
}

/** Observes temporal priority independently of the legacy hit buffer and contacts. */
export class ActionIntegrationBridge {
  readonly #resolver = new PlayerActionResolver()
  #nextStep = 0
  #playerIds: readonly string[] = []
  #snapshots: readonly ShadowActionSnapshot[] = Object.freeze([])
  #suspended = false

  /** Called once per input sample, with the simulator counter before advance(). */
  capture(snapshots: readonly LocalPlayerInputSnapshot[], simulationStep: number): void {
    if (!Number.isSafeInteger(simulationStep) || simulationStep < this.#nextStep) {
      throw new RangeError('Shadow simulation step must be a safe integer and must not move backwards')
    }
    this.#nextStep = simulationStep
    this.#playerIds = [...new Set(snapshots.map(({ playerId }) => playerId))].sort()
    if (this.#suspended) return

    for (const snapshot of snapshots) {
      if (snapshot.hitPressed) {
        this.#resolver.capture(createPlayerActionIntent(createPlayerHitIntent(snapshot)), simulationStep)
      }
      if (snapshot.forearmPassPressed) {
        this.#resolver.capture(createForearmPassIntent(snapshot), simulationStep)
      }
    }
  }

  /** Returns observations in executed step order. A zero-step frame only refreshes diagnostics. */
  observeSteps(executedSteps: number): readonly ShadowActionSnapshot[] {
    const stepAfter = this.#nextStep + executedSteps
    if (!Number.isSafeInteger(executedSteps) || executedSteps < 0 || !Number.isSafeInteger(stepAfter)) {
      throw new RangeError('Shadow observation requires a non-negative safe executed step count and end step')
    }
    const observed: ShadowActionSnapshot[] = []
    if (executedSteps === 0) {
      this.#snapshots = this.observeAt(this.#nextStep)
    }
    for (; this.#nextStep < stepAfter; this.#nextStep += 1) {
      this.#snapshots = this.observeAt(this.#nextStep)
      observed.push(...this.#snapshots)
    }
    return Object.freeze(observed)
  }

  getSnapshots(): readonly ShadowActionSnapshot[] {
    return this.#snapshots
  }

  /** The landing ended the session; ignore further presses until the preview resets. */
  suspend(): void {
    this.#resolver.reset()
    this.#suspended = true
    this.#snapshots = this.observeAt(this.#nextStep)
  }

  reset(): void {
    this.#resolver.reset()
    this.#nextStep = 0
    this.#playerIds = []
    this.#snapshots = Object.freeze([])
    this.#suspended = false
  }

  private observeAt(simulationStep: number): readonly ShadowActionSnapshot[] {
    return Object.freeze(this.#playerIds.map((playerId) => {
      const action = this.#suspended ? null : this.#resolver.select(playerId, simulationStep)
      return Object.freeze({
        playerId,
        simulationStep,
        selectedActionType: action?.actionType ?? null,
        pressStep: action?.pressStep ?? null,
      })
    }))
  }
}
