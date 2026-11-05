import type { PlayerActionIntent } from '@/game/actions/playerActionIntent'
import type { ForearmPassIntent } from '@/game/actions/forearmPassIntent'

export type PlayerCommandIntent = PlayerActionIntent | ForearmPassIntent

export type ResolvableActionType = PlayerActionIntent['actionType'] | ForearmPassIntent['actionType']

export interface PendingPlayerAction {
  readonly playerId: string
  readonly actionType: ResolvableActionType
  readonly pressStep: number
  readonly aimLateral: number
  readonly aimForward: number
}

// 0.1 seconds at 60 Hz, eligible at ages 0 through 5.
const BUFFER_STEPS = 6

/** Selects pending commands only; does not execute contacts or decide sporting validity. */
export class PlayerActionResolver {
  #pending = new Map<string, Map<ResolvableActionType, PendingPlayerAction>>()
  #currentStep = 0

  /** Capture at the supplied simulation step. Held-only snapshots do not renew a candidate. */
  capture(intent: PlayerCommandIntent, pressStep: number): PendingPlayerAction | null {
    this.advanceTo(pressStep)
    const pressed = intent.actionType === 'GENERIC_HIT' ? intent.hitPressed : intent.forearmPassPressed
    if (!pressed) return null

    const action: PendingPlayerAction = Object.freeze({
      playerId: intent.playerId,
      actionType: intent.actionType,
      pressStep,
      aimLateral: intent.aimLateral,
      aimForward: intent.aimForward,
    })
    let candidates = this.#pending.get(action.playerId)
    if (!candidates) {
      candidates = new Map()
      this.#pending.set(action.playerId, candidates)
    }
    candidates.set(action.actionType, action)
    return action
  }

  select(playerId: string, currentStep: number): PendingPlayerAction | null {
    this.advanceTo(currentStep)
    return this.selectedForPlayer(playerId)
  }

  /** Uses the same priority as select(), with one clock advance for all players. */
  selectAll(currentStep: number): readonly PendingPlayerAction[] {
    this.advanceTo(currentStep)
    return Object.freeze([...this.#pending.keys()].sort().flatMap((playerId) => {
      const selected = this.selectedForPlayer(playerId)
      return selected ? [selected] : []
    }))
  }

  private selectedForPlayer(playerId: string): PendingPlayerAction | null {
    const candidates = this.#pending.get(playerId)
    const hit = candidates?.get('GENERIC_HIT')
    const pass = candidates?.get('FOREARM_PASS')
    if (!hit) return pass ?? null
    if (!pass) return hit
    return pass.pressStep <= hit.pressStep ? pass : hit
  }

  /** Requires the exact snapshot returned by this instance, still selected at currentStep. */
  consume(action: PendingPlayerAction, currentStep: number): boolean {
    if (this.select(action.playerId, currentStep) !== action) return false
    this.remove(action)
    return true
  }

  /** Cancels this exact capture, including a non-priority candidate; stale snapshots have no effect. */
  cancel(action: PendingPlayerAction, currentStep: number): boolean {
    this.advanceTo(currentStep)
    if (this.#pending.get(action.playerId)?.get(action.actionType) !== action) return false
    this.remove(action)
    return true
  }

  clearPlayer(playerId: string): void {
    this.#pending.delete(playerId)
  }

  /** Starts a new step-zero session; old snapshots remain invalid even if new data is identical. */
  reset(): void {
    this.#pending.clear()
    this.#currentStep = 0
  }

  private remove(action: PendingPlayerAction): void {
    const candidates = this.#pending.get(action.playerId)
    candidates?.delete(action.actionType)
    if (candidates?.size === 0) this.#pending.delete(action.playerId)
  }

  private advanceTo(step: number): void {
    if (!Number.isSafeInteger(step) || step < 0) {
      throw new RangeError('Action step must be a non-negative safe integer')
    }
    if (step < this.#currentStep) {
      throw new RangeError('Action step must not move backwards')
    }
    this.#currentStep = step
    for (const [playerId, candidates] of this.#pending) {
      for (const [type, action] of candidates) {
        if (step - action.pressStep >= BUFFER_STEPS) candidates.delete(type)
      }
      if (candidates.size === 0) this.#pending.delete(playerId)
    }
  }
}
