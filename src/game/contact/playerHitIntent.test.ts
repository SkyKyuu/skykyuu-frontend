import { describe, expect, it } from 'vitest'
import {
  createPlayerHitIntent,
  type PlayerHitIntent,
} from '@/game/contact/playerHitIntent'
import type { LocalPlayerInputSnapshot } from '@/game/input/inputTypes'

describe('createPlayerHitIntent', () => {
  it('maps player-local lateral movement without using world X', () => {
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
    })
  })
})
