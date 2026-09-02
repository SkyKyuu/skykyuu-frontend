import type { LocalPlayerInputSnapshot } from '@/game/input/inputTypes'

export interface PlayerHitIntent {
  playerId: string
  hitHeld: boolean
  hitPressed: boolean
  /** Player-local lateral aim: -1 is left and +1 is right; not world X. */
  aimLateral: number
  /** Player-local depth aim: -1 is backward and +1 is forward; not world Z. */
  aimForward: number
}

export function createPlayerHitIntent(
  snapshot: LocalPlayerInputSnapshot,
): PlayerHitIntent {
  return {
    playerId: snapshot.playerId,
    hitHeld: snapshot.hitHeld,
    hitPressed: snapshot.hitPressed,
    aimLateral: snapshot.localMove.lateral,
    aimForward: snapshot.localMove.forward,
  }
}
