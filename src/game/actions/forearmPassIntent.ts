import type { LocalPlayerInputSnapshot } from '@/game/input/inputTypes'

/** Captured player-local intention only; no pending action, validity or physics. */
export interface ForearmPassIntent {
  readonly actionType: 'FOREARM_PASS'
  readonly playerId: string
  readonly forearmPassHeld: boolean
  readonly forearmPassPressed: boolean
  readonly aimLateral: number
  readonly aimForward: number
}

export function createForearmPassIntent(
  snapshot: Readonly<LocalPlayerInputSnapshot>,
): ForearmPassIntent {
  return Object.freeze({
    actionType: 'FOREARM_PASS',
    playerId: snapshot.playerId,
    forearmPassHeld: snapshot.forearmPassHeld,
    forearmPassPressed: snapshot.forearmPassPressed,
    aimLateral: snapshot.localMove.lateral,
    aimForward: snapshot.localMove.forward,
  })
}
