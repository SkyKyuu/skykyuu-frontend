import type { LocalPlayerInputSnapshot } from '@/game/input/inputTypes'

/** Captured button state and player-local aim for a set. */
export interface SetIntent {
  readonly actionType: 'SET'
  readonly playerId: string
  readonly setHeld: boolean
  readonly setPressed: boolean
  readonly aimLateral: number
  readonly aimForward: number
}

export function createSetIntent(snapshot: Readonly<LocalPlayerInputSnapshot>): SetIntent {
  return Object.freeze({
    actionType: 'SET',
    playerId: snapshot.playerId,
    setHeld: snapshot.setHeld,
    setPressed: snapshot.setPressed,
    aimLateral: snapshot.localMove.lateral,
    aimForward: snapshot.localMove.forward,
  })
}
