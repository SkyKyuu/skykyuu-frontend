import type { PlayerActionType } from '@/game/actions/playerActionTypes'
import type { PlayerHitIntent } from '@/game/contact/playerHitIntent'

/** Immutable player-local intention; hit capture and execution remain in the existing hit flow. */
export interface PlayerActionIntent extends Readonly<PlayerHitIntent> {
  readonly actionType: PlayerActionType
}

/** Represents an existing hit intent without validating or transforming its captured values. */
export function createPlayerActionIntent(
  hitIntent: Readonly<PlayerHitIntent>,
): PlayerActionIntent {
  return Object.freeze({
    actionType: 'GENERIC_HIT',
    playerId: hitIntent.playerId,
    hitHeld: hitIntent.hitHeld,
    hitPressed: hitIntent.hitPressed,
    aimLateral: hitIntent.aimLateral,
    aimForward: hitIntent.aimForward,
  })
}
