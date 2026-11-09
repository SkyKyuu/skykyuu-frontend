import { describe, expect, expectTypeOf, it } from 'vitest'
import { createForearmPassIntent, type ForearmPassIntent } from '@/game/actions/forearmPassIntent'
import { createPlayerActionIntent } from '@/game/actions/playerActionIntent'
import { createPlayerHitIntent } from '@/game/contact/playerHitIntent'
import type { LocalPlayerInputSnapshot } from '@/game/input/inputTypes'
import { LocalInputManager } from '@/game/input/LocalInputManager'
import { FixedStepVolleyballSimulator } from '@/game/ball/FixedStepVolleyballSimulator'
import { VOLLEYBALL_SIMULATION_CONFIG } from '@/game/ball/volleyballSimulationConfig'

function snapshot(overrides: Partial<LocalPlayerInputSnapshot> = {}): LocalPlayerInputSnapshot {
  return {
    playerId: 'player', teamSide: 'A', deviceKind: 'keyboard', deviceName: 'Keyboard', deviceConnected: true,
    localMove: { lateral: 0.375, forward: -0.25 }, worldMove: { worldX: -1, worldZ: 1 },
    jumpHeld: false, jumpPressed: false, hitHeld: false, hitPressed: false,
    forearmPassHeld: true, forearmPassPressed: true,
    setHeld: false, setPressed: false, ...overrides,
  }
}

describe('forearm pass local intent', () => {
  it('has only the six immutable approved fields and a FOREARM_PASS discriminant', () => {
    expectTypeOf<ForearmPassIntent>().toEqualTypeOf<Readonly<ForearmPassIntent>>()
    expectTypeOf<ForearmPassIntent['actionType']>().toEqualTypeOf<'FOREARM_PASS'>()
    expect(createForearmPassIntent(snapshot())).toEqual({
      actionType: 'FOREARM_PASS', playerId: 'player', forearmPassHeld: true,
      forearmPassPressed: true, aimLateral: 0.375, aimForward: -0.25,
    })
  })

  it.each(['player-a', 'player-b', ' jogador/α 01 '])('preserves player identity %s exactly', (playerId) => {
    expect(createForearmPassIntent(snapshot({ playerId })).playerId).toBe(playerId)
  })

  it.each([
    [false, false], [true, false], [true, true], [false, true],
  ])('represents held=%s and pressed=%s without deciding validity', (forearmPassHeld, forearmPassPressed) => {
    expect(createForearmPassIntent(snapshot({ forearmPassHeld, forearmPassPressed }))).toMatchObject({
      forearmPassHeld, forearmPassPressed,
    })
  })

  const localCases = (['A', 'B'] as const).flatMap((teamSide) => [
    [-1, 1], [0, 0], [-0, -0], [1, -1], [0.375, -0.25],
    [-Math.SQRT1_2, Math.SQRT1_2], [Math.SQRT1_2, -Math.SQRT1_2],
  ].map(([lateral, forward]) => [teamSide, lateral, forward] as const))

  it.each(localCases)('Team %s preserves local lateral %s and forward %s without world mapping', (teamSide, lateral, forward) => {
    const action = createForearmPassIntent(snapshot({
      teamSide, localMove: { lateral, forward },
      worldMove: { worldX: teamSide === 'A' ? 1 : -1, worldZ: teamSide === 'A' ? -1 : 1 },
    }))
    expect(action.aimLateral).toBe(lateral)
    expect(action.aimForward).toBe(forward)
  })

  it.each([-1.01, 1.01, NaN, Infinity, -Infinity])('does not add numeric validation for %s', (value) => {
    const action = createForearmPassIntent(snapshot({ localMove: { lateral: value, forward: value } }))
    expect(action.aimLateral).toBe(value)
    expect(action.aimForward).toBe(value)
  })

  it('does not mutate the snapshot and produces an immutable independent object', () => {
    const input = snapshot()
    const original = structuredClone(input)
    const action = createForearmPassIntent(input)
    expect(input).toEqual(original)
    expect(Object.isFrozen(input)).toBe(false)
    expect(Object.isFrozen(action)).toBe(true)
    expect(Reflect.set(action, 'aimForward', 1)).toBe(false)
    expect(Reflect.set(action, 'actionType', 'GENERIC_HIT')).toBe(false)
    input.localMove.lateral = -1
    input.localMove.forward = 1
    input.playerId = 'changed'
    input.forearmPassHeld = false
    input.forearmPassPressed = false
    expect(action).toEqual({
      actionType: 'FOREARM_PASS', playerId: 'player', forearmPassHeld: true,
      forearmPassPressed: true, aimLateral: 0.375, aimForward: -0.25,
    })
  })

  it('is deterministic, accepts frozen inputs and retains no prior intent', () => {
    const first = Object.freeze(snapshot({ localMove: Object.freeze({ lateral: 0.375, forward: -0.25 }) }))
    const before = createForearmPassIntent(first)
    expect(createForearmPassIntent(snapshot({ playerId: 'second' })).playerId).toBe('second')
    expect(createForearmPassIntent(first)).toEqual(before)
    expect(createForearmPassIntent(first)).not.toBe(before)
  })

  it('keeps simultaneous pass and generic intentions independent with the legacy hit shape', () => {
    const input = snapshot({ hitHeld: true, hitPressed: true })
    const hit = createPlayerHitIntent(input)
    expect(hit).toEqual({ playerId: 'player', hitHeld: true, hitPressed: true, aimLateral: 0.375, aimForward: -0.25 })
    expect(createPlayerActionIntent(hit)).toEqual({ actionType: 'GENERIC_HIT', ...hit })
    expect(createForearmPassIntent(input)).toMatchObject({ actionType: 'FOREARM_PASS', forearmPassPressed: true })
  })

  it.each(['A', 'B'] as const)('Q creates no pass response or physics and leaves generic E unchanged for Team %s', (teamSide) => {
    function run(pass: boolean, hit: boolean) {
      const manager = new LocalInputManager([{ playerId: 'player', teamSide, deviceKind: 'keyboard' }], { keyboardTarget: window })
      manager.start()
      try {
        if (pass) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ' }))
        if (hit) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }))
        const input = manager.update()[0]
        expect(createForearmPassIntent(input).forearmPassPressed).toBe(pass)
        const hitIntent = createPlayerHitIntent(input)
        expect(hitIntent.hitPressed).toBe(hit)
        const simulator = new FixedStepVolleyballSimulator({
          position: { x: 0, y: 1, z: 0 }, velocity: { x: 0.25, y: 0, z: 0 },
        })
        const step = VOLLEYBALL_SIMULATION_CONFIG.fixedStepSeconds
        const result = simulator.advance(step, [{ playerId: 'player', teamSide, position: { x: 0, y: 0, z: 0 } }], [hitIntent])
        expect(result.events.some((event) => event.type === 'PLAYER_CONTACT_RESPONSE')).toBe(hit)
        const responseState = simulator.getState()
        const following = simulator.advance(step)
        return { result, responseState, following, followingState: simulator.getState() }
      } finally {
        manager.dispose()
      }
    }
    expect(run(true, false)).toEqual(run(false, false))
    expect(run(true, true)).toEqual(run(false, true))
  })
})
