import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { PlayerActionResolver, type PendingPlayerAction, type ResolvableActionType } from '@/game/actions/playerActionResolver'
import { createPlayerActionIntent, type PlayerActionIntent } from '@/game/actions/playerActionIntent'
import { createForearmPassIntent, type ForearmPassIntent } from '@/game/actions/forearmPassIntent'
import { createPlayerHitIntent } from '@/game/contact/playerHitIntent'
import type { LocalPlayerInputSnapshot } from '@/game/input/inputTypes'
import { FixedStepVolleyballSimulator } from '@/game/ball/FixedStepVolleyballSimulator'
import { VOLLEYBALL_SIMULATION_CONFIG } from '@/game/ball/volleyballSimulationConfig'

function intent(type: ResolvableActionType, playerId = 'player', lateral = 0.375, forward = -0.25): PlayerActionIntent | ForearmPassIntent {
  return type === 'GENERIC_HIT'
    ? { actionType: type, playerId, hitHeld: true, hitPressed: true, aimLateral: lateral, aimForward: forward }
    : { actionType: type, playerId, forearmPassHeld: true, forearmPassPressed: true, aimLateral: lateral, aimForward: forward }
}

function capture(resolver: PlayerActionResolver, type: ResolvableActionType, step: number, playerId = 'player', lateral = 0.375, forward = -0.25): PendingPlayerAction {
  const action = resolver.capture(intent(type, playerId, lateral, forward), step)
  if (!action) throw new Error('Missing capture')
  return action
}

afterEach(() => vi.restoreAllMocks())

describe('isolated player action capture and priority', () => {
  it('exposes only the approved immutable pending data', () => {
    expectTypeOf<ResolvableActionType>().toEqualTypeOf<'GENERIC_HIT' | 'FOREARM_PASS'>()
    expectTypeOf<PendingPlayerAction>().toEqualTypeOf<Readonly<PendingPlayerAction>>()
    expect(capture(new PlayerActionResolver(), 'GENERIC_HIT', 0)).toEqual({
      playerId: 'player', actionType: 'GENERIC_HIT', pressStep: 0, aimLateral: 0.375, aimForward: -0.25,
    })
  })

  it.each(['GENERIC_HIT', 'FOREARM_PASS'] as const)('selects an isolated %s', (type) => {
    const resolver = new PlayerActionResolver()
    expect(resolver.select('player', 0)).toBeNull()
    const action = capture(resolver, type, 0)
    expect(resolver.select('player', 0)).toBe(action)
  })

  it.each(['GENERIC_HIT', 'FOREARM_PASS'] as const)('keeps first %s ahead of a later different action', (firstType) => {
    const resolver = new PlayerActionResolver()
    const first = capture(resolver, firstType, 0)
    capture(resolver, firstType === 'GENERIC_HIT' ? 'FOREARM_PASS' : 'GENERIC_HIT', 2)
    expect(resolver.select('player', 2)).toBe(first)
    expect(resolver.select('player', 5)).toBe(first)
  })

  it.each([
    ['GENERIC_HIT', 'FOREARM_PASS'], ['FOREARM_PASS', 'GENERIC_HIT'],
  ] as const)('resolves same-step %s then %s to pass, preserving generic after consumption', (first, second) => {
    const resolver = new PlayerActionResolver()
    capture(resolver, first, 4)
    capture(resolver, second, 4)
    const selected = resolver.select('player', 4)!
    expect(selected.actionType).toBe('FOREARM_PASS')
    expect(resolver.consume(selected, 4)).toBe(true)
    expect(resolver.select('player', 4)?.actionType).toBe('GENERIC_HIT')
  })

  it('isolates players and allows an unrelated player to advance time without changing priority', () => {
    const resolver = new PlayerActionResolver()
    const first = capture(resolver, 'GENERIC_HIT', 0, 'a')
    const other = capture(resolver, 'FOREARM_PASS', 0, 'b')
    capture(resolver, 'FOREARM_PASS', 2, 'a')
    expect(resolver.select('b', 3)).toBe(other)
    expect(resolver.select('a', 3)).toBe(first)
    expect(resolver.select('unknown', 3)).toBeNull()
  })

  it.each(['GENERIC_HIT', 'FOREARM_PASS'] as const)('ignores held-only and released %s snapshots without renewing captures', (type) => {
    const resolver = new PlayerActionResolver()
    const action = capture(resolver, type, 0)
    const held = intent(type)
    const noEdge = held.actionType === 'GENERIC_HIT' ? { ...held, hitPressed: false } : { ...held, forearmPassPressed: false }
    expect(resolver.capture(noEdge, 4)).toBeNull()
    expect(resolver.select('player', 5)).toBe(action)
    expect(resolver.capture(noEdge, 6)).toBeNull()
    expect(resolver.select('player', 6)).toBeNull()
  })
})

describe('six-step eligibility and candidate promotion', () => {
  it.each(['GENERIC_HIT', 'FOREARM_PASS'] as const)('keeps %s at ages zero and five, expires at six, and rejects old references', (type) => {
    const resolver = new PlayerActionResolver()
    const action = capture(resolver, type, 10)
    expect(resolver.select('player', 10)).toBe(action)
    expect(resolver.select('player', 15)).toBe(action)
    expect(resolver.select('player', 15)).toBe(action)
    expect(resolver.select('player', 16)).toBeNull()
    expect(resolver.consume(action, 16)).toBe(false)
    expect(resolver.cancel(action, 16)).toBe(false)
  })

  it.each(['GENERIC_HIT', 'FOREARM_PASS'] as const)('promotes a later candidate when %s expires without granting a new window', (first) => {
    const resolver = new PlayerActionResolver()
    const older = capture(resolver, first, 0)
    const later = capture(resolver, first === 'GENERIC_HIT' ? 'FOREARM_PASS' : 'GENERIC_HIT', 2)
    expect(resolver.select('player', 5)).toBe(older)
    expect(resolver.select('player', 6)).toBe(later)
    expect(resolver.select('player', 7)).toBe(later)
    expect(later.pressStep).toBe(2)
    expect(resolver.select('player', 8)).toBeNull()
  })

  it('does not promote an already expired candidate after a jump in steps', () => {
    const resolver = new PlayerActionResolver()
    capture(resolver, 'GENERIC_HIT', 0)
    capture(resolver, 'FOREARM_PASS', 2)
    expect(resolver.select('player', 20)).toBeNull()
  })

  it('supports steps near the safe-integer boundary without overflow in deadlines', () => {
    const resolver = new PlayerActionResolver()
    const action = capture(resolver, 'GENERIC_HIT', Number.MAX_SAFE_INTEGER - 6)
    expect(resolver.select('player', Number.MAX_SAFE_INTEGER - 1)).toBe(action)
    expect(resolver.select('player', Number.MAX_SAFE_INTEGER)).toBeNull()
  })
})

describe('re-press and exact capture identity', () => {
  it.each(['GENERIC_HIT', 'FOREARM_PASS'] as const)('replaces only %s and recomputes priority using new step and aim', (type) => {
    const resolver = new PlayerActionResolver()
    const old = capture(resolver, type, 0)
    const otherPlayer = capture(resolver, type, 0, 'other')
    const candidate = capture(resolver, type === 'GENERIC_HIT' ? 'FOREARM_PASS' : 'GENERIC_HIT', 1)
    const replacement = capture(resolver, type, 2, 'player', -Math.SQRT1_2, Math.SQRT1_2)
    expect(replacement).toMatchObject({ pressStep: 2, aimLateral: -Math.SQRT1_2, aimForward: Math.SQRT1_2 })
    expect(resolver.select('player', 2)).toBe(candidate)
    expect(resolver.select('other', 2)).toBe(otherPlayer)
    expect(resolver.consume(old, 2)).toBe(false)
    expect(resolver.cancel(old, 2)).toBe(false)
    expect(resolver.consume(candidate, 2)).toBe(true)
    expect(resolver.select('player', 7)).toBe(replacement)
    expect(resolver.select('player', 8)).toBeNull()
  })

  it('invalidates same-step replacements even with identical data', () => {
    const resolver = new PlayerActionResolver()
    const old = capture(resolver, 'GENERIC_HIT', 0)
    const replacement = capture(resolver, 'GENERIC_HIT', 0)
    expect(replacement).toEqual(old)
    expect(replacement).not.toBe(old)
    expect(resolver.consume(old, 0)).toBe(false)
    expect(resolver.cancel(old, 0)).toBe(false)
    expect(resolver.select('player', 0)).toBe(replacement)
    expect(resolver.consume(replacement, 0)).toBe(true)
    expect(resolver.select('player', 0)).toBeNull()
  })

  it('rejects copies and snapshots from another instance without consuming real captures', () => {
    const resolver = new PlayerActionResolver()
    const action = capture(resolver, 'FOREARM_PASS', 0)
    const other = capture(new PlayerActionResolver(), 'FOREARM_PASS', 0)
    for (const stale of [{ ...action }, other]) {
      expect(resolver.consume(stale, 0)).toBe(false)
      expect(resolver.cancel(stale, 0)).toBe(false)
    }
    expect(resolver.select('player', 0)).toBe(action)
  })
})

describe('consumption, cancellation and reset', () => {
  it('consumes only the selected exact action once and promotes the other without renewal', () => {
    const resolver = new PlayerActionResolver()
    const hit = capture(resolver, 'GENERIC_HIT', 0)
    const pass = capture(resolver, 'FOREARM_PASS', 0)
    const other = capture(resolver, 'GENERIC_HIT', 0, 'other')
    expect(resolver.consume(hit, 1)).toBe(false)
    expect(resolver.consume(pass, 1)).toBe(true)
    expect(resolver.consume(pass, 1)).toBe(false)
    expect(resolver.select('other', 1)).toBe(other)
    expect(resolver.select('player', 5)).toBe(hit)
    expect(resolver.consume(hit, 6)).toBe(false)
  })

  it('cancels a specific non-priority candidate without touching priority or another player', () => {
    const resolver = new PlayerActionResolver()
    const hit = capture(resolver, 'GENERIC_HIT', 0)
    const other = capture(resolver, 'FOREARM_PASS', 0, 'other')
    const pass = capture(resolver, 'FOREARM_PASS', 2)
    expect(resolver.cancel(pass, 2)).toBe(true)
    expect(resolver.cancel(pass, 2)).toBe(false)
    expect(resolver.select('player', 2)).toBe(hit)
    expect(resolver.select('other', 2)).toBe(other)
    expect(resolver.select('player', 6)).toBeNull()
  })

  it('cancels priority and immediately promotes the surviving candidate', () => {
    const resolver = new PlayerActionResolver()
    const hit = capture(resolver, 'GENERIC_HIT', 0)
    const pass = capture(resolver, 'FOREARM_PASS', 1)
    expect(resolver.cancel(hit, 2)).toBe(true)
    expect(resolver.select('player', 2)).toBe(pass)
  })

  it('clears one player, preserves others and invalidates references before recapture', () => {
    const resolver = new PlayerActionResolver()
    const old = capture(resolver, 'FOREARM_PASS', 0)
    capture(resolver, 'GENERIC_HIT', 0)
    const other = capture(resolver, 'GENERIC_HIT', 0, 'other')
    resolver.clearPlayer('player')
    resolver.clearPlayer('unknown')
    expect(resolver.select('player', 0)).toBeNull()
    expect(resolver.select('other', 0)).toBe(other)
    const replacement = capture(resolver, 'FOREARM_PASS', 0)
    expect(resolver.consume(old, 0)).toBe(false)
    expect(resolver.cancel(old, 0)).toBe(false)
    expect(resolver.select('player', 0)).toBe(replacement)
  })

  it('resets all players and time while old snapshots cannot affect the new session', () => {
    const resolver = new PlayerActionResolver()
    const old = capture(resolver, 'FOREARM_PASS', 0)
    capture(resolver, 'GENERIC_HIT', 3, 'other')
    resolver.reset()
    expect(resolver.select('player', 0)).toBeNull()
    expect(resolver.select('other', 0)).toBeNull()
    const nextSession = capture(resolver, 'FOREARM_PASS', 0)
    expect(nextSession).toEqual(old)
    expect(resolver.consume(old, 0)).toBe(false)
    expect(resolver.cancel(old, 0)).toBe(false)
    expect(resolver.select('player', 0)).toBe(nextSession)
  })
})

describe('immutable local data and deterministic step clock', () => {
  it.each([-1, 0, -0, 1, 0.375, -Math.SQRT1_2, Math.SQRT1_2])('preserves analog %s exactly and protects captured aim from source mutation', (aim) => {
    const resolver = new PlayerActionResolver()
    const source = { actionType: 'GENERIC_HIT' as const, playerId: 'player', hitHeld: true, hitPressed: true, aimLateral: aim, aimForward: aim }
    const original = { ...source }
    const action = resolver.capture(source, 0)!
    expect(source).toEqual(original)
    expect(Object.isFrozen(source)).toBe(false)
    source.aimLateral = 0.99
    source.aimForward = -0.99
    source.playerId = 'changed'
    expect(action.aimLateral).toBe(aim)
    expect(action.aimForward).toBe(aim)
    expect(Object.isFrozen(action)).toBe(true)
    expect(Reflect.set(action, 'pressStep', 100)).toBe(false)
    expect(Reflect.set(action, 'aimForward', 0.99)).toBe(false)
    expect(resolver.select('player', 0)).toBe(action)
  })

  it.each([-1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid step %s atomically in all timed operations', (step) => {
    const resolver = new PlayerActionResolver()
    const action = capture(resolver, 'GENERIC_HIT', 0)
    expect(() => resolver.capture(intent('GENERIC_HIT'), step)).toThrow(RangeError)
    expect(() => resolver.select('player', step)).toThrow(RangeError)
    expect(() => resolver.consume(action, step)).toThrow(RangeError)
    expect(() => resolver.cancel(action, step)).toThrow(RangeError)
    expect(resolver.select('player', 0)).toBe(action)
  })

  it('rejects time reversal across players and operations without altering pending data', () => {
    const resolver = new PlayerActionResolver()
    const action = capture(resolver, 'GENERIC_HIT', 3)
    resolver.select('unknown', 4)
    expect(() => resolver.capture(intent('FOREARM_PASS', 'other'), 3)).toThrow('backwards')
    expect(() => resolver.select('player', 3)).toThrow('backwards')
    expect(() => resolver.consume(action, 3)).toThrow('backwards')
    expect(() => resolver.cancel(action, 3)).toThrow('backwards')
    resolver.clearPlayer('other')
    expect(() => resolver.select('player', 3)).toThrow('backwards')
    expect(resolver.select('player', 4)).toBe(action)
  })

  it('does not access real time or timers', () => {
    const rejectClock = () => { throw new Error('Real-time dependency') }
    vi.spyOn(Date, 'now').mockImplementation(rejectClock)
    vi.spyOn(performance, 'now').mockImplementation(rejectClock)
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(rejectClock)
    vi.spyOn(globalThis, 'setInterval').mockImplementation(rejectClock)
    const resolver = new PlayerActionResolver()
    const action = capture(resolver, 'GENERIC_HIT', 0)
    const selected = resolver.select('player', 5)
    const consumed = resolver.consume(action, 5)
    vi.restoreAllMocks()
    expect(selected).toBe(action)
    expect(consumed).toBe(true)
  })

  it('produces identical complex sequences independent of same-step insertion order', () => {
    function run(reverse: boolean) {
      const resolver = new PlayerActionResolver()
      for (const type of reverse ? ['FOREARM_PASS', 'GENERIC_HIT'] as const : ['GENERIC_HIT', 'FOREARM_PASS'] as const) {
        capture(resolver, type, 0)
      }
      const trace: unknown[] = [resolver.select('player', 0)]
      const pass = resolver.select('player', 0)!
      trace.push(resolver.consume(pass, 0), resolver.select('player', 0))
      capture(resolver, 'FOREARM_PASS', 1, 'other')
      const laterPass = capture(resolver, 'FOREARM_PASS', 2)
      capture(resolver, 'GENERIC_HIT', 3, 'player', -1, 1)
      trace.push(resolver.select('player', 3), resolver.select('other', 3))
      trace.push(resolver.cancel(laterPass, 4), resolver.select('player', 4))
      capture(resolver, 'FOREARM_PASS', 5)
      trace.push(resolver.select('player', 8), resolver.select('player', 9), resolver.select('other', 9))
      trace.push(resolver.select('player', 11))
      resolver.reset()
      trace.push(resolver.select('player', 0))
      return trace
    }
    expect(run(false)).toEqual(run(true))
    expect(run(false)).toEqual(run(false))
  })

  it('accepts existing factories while leaving the legacy hit API and simulation untouched', () => {
    const snapshot: LocalPlayerInputSnapshot = {
      playerId: 'player', teamSide: 'B', deviceKind: 'keyboard', deviceName: 'Keyboard', deviceConnected: true,
      localMove: { lateral: Math.SQRT1_2, forward: -Math.SQRT1_2 }, worldMove: { worldX: -1, worldZ: 1 },
      jumpHeld: false, jumpPressed: false, hitHeld: true, hitPressed: true,
      forearmPassHeld: true, forearmPassPressed: true,
    }
    const original = structuredClone(snapshot)
    const legacy = createPlayerHitIntent(snapshot)
    const resolver = new PlayerActionResolver()
    resolver.capture(createPlayerActionIntent(legacy), 0)
    resolver.capture(createForearmPassIntent(snapshot), 0)
    const selected = resolver.select('player', 0)!
    expect(selected).toEqual({ playerId: 'player', actionType: 'FOREARM_PASS', pressStep: 0,
      aimLateral: Math.SQRT1_2, aimForward: -Math.SQRT1_2 })
    expect(snapshot).toEqual(original)
    expect(legacy).toEqual({ playerId: 'player', hitHeld: true, hitPressed: true,
      aimLateral: Math.SQRT1_2, aimForward: -Math.SQRT1_2 })
    const initial = { position: { x: 0, y: 1, z: 0 }, velocity: { x: 0.25, y: 0, z: 0 } }
    const simulator = new FixedStepVolleyballSimulator(initial)
    expect(resolver.consume(selected, 0)).toBe(true)
    expect(simulator.getState()).toEqual(initial)
    const neutral = new FixedStepVolleyballSimulator(initial)
    const step = VOLLEYBALL_SIMULATION_CONFIG.fixedStepSeconds
    const targets = [{ playerId: 'player', teamSide: 'B' as const, position: { x: 0, y: 0, z: 0 } }]
    const passive = simulator.advance(step, targets)
    expect(passive).toEqual(neutral.advance(step, targets))
    expect(passive.events.some((event) => event.type === 'PLAYER_CONTACT_RESPONSE')).toBe(false)
    const active = new FixedStepVolleyballSimulator(initial)
    const hit = active.advance(step, targets, [legacy])
    expect(hit.events.find((event) => event.type === 'PLAYER_CONTACT_RESPONSE')).toMatchObject({
      outgoingVelocity: { x: 0.25 - Math.SQRT1_2 * 3, y: 6.3, z: -5 + Math.SQRT1_2 * 2 },
    })
  })
})
