import { describe, expectTypeOf, it } from 'vitest'
import type { PlayerActionType } from '@/game/actions/playerActionTypes'
import type { PlayerActionIntent } from '@/game/actions/playerActionIntent'
import type { PlayerHitIntent } from '@/game/contact/playerHitIntent'

describe('player action type contract', () => {
  it('contains only the approved GENERIC_HIT action', () => {
    expectTypeOf<PlayerActionType>().toEqualTypeOf<'GENERIC_HIT'>()
    expectTypeOf<PlayerActionIntent['actionType']>().toEqualTypeOf<PlayerActionType>()
  })

  it('reuses all legacy intent fields as readonly data', () => {
    expectTypeOf<Pick<PlayerActionIntent, keyof PlayerHitIntent>>()
      .toEqualTypeOf<Readonly<PlayerHitIntent>>()
    expectTypeOf<PlayerActionIntent>().toEqualTypeOf<Readonly<PlayerActionIntent>>()
    expectTypeOf<keyof PlayerActionIntent>().toEqualTypeOf<keyof PlayerHitIntent | 'actionType'>()
  })
})
