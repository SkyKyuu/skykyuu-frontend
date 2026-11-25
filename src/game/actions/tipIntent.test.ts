import { describe, expect, it } from 'vitest'
import { createTipIntent } from '@/game/actions/tipIntent'
import type { LocalPlayerInputSnapshot } from '@/game/input/inputTypes'
import { SceneFixedStepRunner } from '@/game/scene/SceneFixedStepRunner'

function snapshot(overrides: Partial<LocalPlayerInputSnapshot> = {}): LocalPlayerInputSnapshot {
  return {
    playerId: 'a', teamSide: 'A', deviceKind: 'keyboard', deviceName: 'Keyboard',
    deviceConnected: true, localMove: { lateral: 0, forward: 0 }, worldMove: { worldX: 0, worldZ: 0 },
    jumpHeld: false, jumpPressed: false, hitHeld: false, hitPressed: false,
    forearmPassHeld: false, forearmPassPressed: false, setHeld: false, setPressed: false,
    ...overrides,
  }
}

describe('TIP intent compatibility and captured local aim', () => {
  it('treats an existing snapshot without TIP fields as not pressed', () => {
    expect(createTipIntent(snapshot())).toEqual({
      actionType: 'TIP', playerId: 'a', teamSide: 'A', tipPressed: false,
      aimLateral: 0, aimForward: 0,
    })
  })

  it('uses detached captured aim rather than subsequent movement and freezes the intent', () => {
    const aim = { lateral: -0.6, forward: 0.8 }
    const sample = snapshot({ tipPressed: true, tipPressAim: aim, localMove: { lateral: 1, forward: 0 } })
    const intent = createTipIntent(sample)
    aim.lateral = 0
    sample.localMove.forward = -1
    expect(intent).toEqual({
      actionType: 'TIP', playerId: 'a', teamSide: 'A', tipPressed: true,
      aimLateral: -0.6, aimForward: 0.8,
    })
    expect(Object.isFrozen(intent)).toBe(true)
  })

  it.each(['A', 'B'] as const)('preserves Team %s local coordinates without converting to world axes', (teamSide) => {
    expect(createTipIntent(snapshot({
      teamSide, tipPressed: true, localMove: { lateral: -1, forward: 0.25 },
    }))).toMatchObject({ teamSide, aimLateral: -1, aimForward: 0.25 })
  })

  it('does not turn held-only TIP into a pressed action', () => {
    expect(createTipIntent(snapshot({ tipHeld: true })).tipPressed).toBe(false)
  })

  it.each([NaN, Infinity, -Infinity, 1.01, -1.01])('rejects invalid lateral aim %s through the existing atomic scene validation', (bad) => {
    const runner = new SceneFixedStepRunner([
      { playerId: 'a', teamSide: 'A', position: { x: 0, y: 0, z: -4 } },
    ])
    expect(() => runner.queueInput([snapshot({
      tipPressed: true, tipPressAim: { lateral: bad, forward: 0 },
    })])).toThrow(RangeError)
    expect(runner.sceneTick).toBe(0)
    expect(runner.advanceFrame(1 / 60).ticks[0].actionStep.selectedActions).toEqual([])
  })

  it.each([NaN, Infinity, -Infinity, 1.01, -1.01])('rejects invalid forward aim %s without silently correcting it', (bad) => {
    const runner = new SceneFixedStepRunner([
      { playerId: 'a', teamSide: 'A', position: { x: 0, y: 0, z: -4 } },
    ])
    expect(() => runner.queueInput([snapshot({
      tipPressed: true, tipPressAim: { lateral: 0, forward: bad },
    })])).toThrow(RangeError)
    expect(runner.sceneTick).toBe(0)
  })
})
