import { describe, expectTypeOf, it } from 'vitest'
import type { PlayerActionType } from '@/game/actions/playerActionTypes'
import type { PlayerActionIntent } from '@/game/actions/playerActionIntent'
import type { PlayerHitIntent } from '@/game/contact/playerHitIntent'

describe('player action type contract', () => {
  it('contains GENERIC_HIT, FOREARM_PASS and SET while preserving the generic adapter type', () => {
    expectTypeOf<PlayerActionType>().toEqualTypeOf<'GENERIC_HIT' | 'FOREARM_PASS' | 'SET'>()
    expectTypeOf<PlayerActionIntent['actionType']>().toEqualTypeOf<'GENERIC_HIT'>()
  })

  it('reuses all legacy intent fields as readonly data', () => {
    expectTypeOf<Pick<PlayerActionIntent, keyof PlayerHitIntent>>()
      .toEqualTypeOf<Readonly<PlayerHitIntent>>()
    expectTypeOf<PlayerActionIntent>().toEqualTypeOf<Readonly<PlayerActionIntent>>()
    expectTypeOf<keyof PlayerActionIntent>().toEqualTypeOf<keyof PlayerHitIntent | 'actionType'>()
  })
})
