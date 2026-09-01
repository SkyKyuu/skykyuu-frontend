import type { LocalPlayerInputSnapshot } from '@/game/input/inputTypes'

export interface PlayerHitIntent {
  playerId: string
  hitHeld: boolean
  hitPressed: boolean
  /** Player-local lateral aim: -1 is left and +1 is right; not world X. */
  aimLateral: number
}

export function createPlayerHitIntent(
  snapshot: LocalPlayerInputSnapshot,
): PlayerHitIntent {
  return {
    playerId: snapshot.playerId,
    hitHeld: snapshot.hitHeld,
    hitPressed: snapshot.hitPressed,
    aimLateral: snapshot.localMove.lateral,
  }
}
