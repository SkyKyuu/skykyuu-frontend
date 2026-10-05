import { describe, expect, it } from 'vitest'
import {
  createPlayerHitIntent,
  type PlayerHitIntent,
} from '@/game/contact/playerHitIntent'
import type { LocalPlayerInputSnapshot } from '@/game/input/inputTypes'

describe('createPlayerHitIntent', () => {
  it.each(['A', 'B'] as const)('uses local forward for Team %s without world Z conversion', (teamSide) => {
    const snapshot: LocalPlayerInputSnapshot = {
      playerId: 'player', teamSide, deviceKind: 'keyboard',
      deviceName: 'Keyboard', deviceConnected: true,
      localMove: { lateral: Math.SQRT1_2, forward: Math.SQRT1_2 },
      worldMove: { worldX: 0, worldZ: -1 },
      jumpHeld: false, jumpPressed: false, hitHeld: true, hitPressed: true,
    }
    const intent = createPlayerHitIntent(snapshot)
    snapshot.localMove.forward = -1
    expect(intent.aimForward).toBe(Math.SQRT1_2)
    expect(intent.aimLateral).toBe(Math.SQRT1_2)
  })

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
      aimForward: -0.25,
    })
  })
})
