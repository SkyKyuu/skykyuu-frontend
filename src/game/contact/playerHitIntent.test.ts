import { describe, expect, it } from 'vitest'
import {
  createPlayerHitIntent,
  type PlayerHitIntent,
} from '@/game/contact/playerHitIntent'
import type { LocalPlayerInputSnapshot } from '@/game/input/inputTypes'

describe('createPlayerHitIntent', () => {
  it('maps both player-local aim axes without using world movement', () => {
    const snapshot: LocalPlayerInputSnapshot = {
      playerId: 'player-b',
      teamSide: 'B',
      deviceKind: 'gamepad',
      deviceName: 'Test Gamepad',
      deviceConnected: true,
      localMove: { lateral: 0.375, forward: -0.25 },
      worldMove: { worldX: -0.875, worldZ: 0.5 },
      jumpHeld: false,
      jumpPressed: false,
      hitHeld: true,
      hitPressed: true,
    }

    expect(createPlayerHitIntent(snapshot)).toEqual<PlayerHitIntent>({
      playerId: 'player-b',
      hitHeld: true,
      hitPressed: true,
      aimLateral: 0.375,
      aimForward: -0.25,
    })
  })

  it('preserves an already-normalized diagonal without normalizing again', () => {
    const diagonal = Math.SQRT1_2
    const snapshot: LocalPlayerInputSnapshot = {
      playerId: 'player-a',
      teamSide: 'A',
      deviceKind: 'keyboard',
      deviceName: 'Keyboard',
      deviceConnected: true,
      localMove: { lateral: diagonal, forward: diagonal },
      worldMove: { worldX: -0.25, worldZ: -0.75 },
      jumpHeld: false,
      jumpPressed: false,
      hitHeld: true,
      hitPressed: true,
    }

    const intent = createPlayerHitIntent(snapshot)

    expect(intent.aimLateral).toBe(diagonal)
    expect(intent.aimForward).toBe(diagonal)
  })
})
