import { describe, expect, it, vi } from 'vitest'
import { ActionIntegrationBridge } from '@/game/actions/actionIntegrationBridge'
import { PlayerActionResolver } from '@/game/actions/playerActionResolver'
import { FixedStepVolleyballSimulator } from '@/game/ball/FixedStepVolleyballSimulator'
import { VOLLEYBALL_SIMULATION_CONFIG } from '@/game/ball/volleyballSimulationConfig'
import { VOLLEYBALL_CONFIG } from '@/game/ball/volleyballConfig'
import { createPlayerHitIntent } from '@/game/contact/playerHitIntent'
import type { LocalPlayerInputSnapshot } from '@/game/input/inputTypes'
import { PlayerMovementController } from '@/game/movement/PlayerMovementController'

const STEP = VOLLEYBALL_SIMULATION_CONFIG.fixedStepSeconds
const initial = { position: { x: 0, y: 1, z: 0 }, velocity: { x: 0.25, y: 0, z: 0 } }
const contact = { playerId: 'a', teamSide: 'A' as const, position: { x: 0, y: 0, z: 0 } }

function input(overrides: Partial<LocalPlayerInputSnapshot> = {}): LocalPlayerInputSnapshot {
  return {
    playerId: 'a', teamSide: 'A', deviceKind: 'keyboard', deviceName: 'Keyboard', deviceConnected: true,
    localMove: { lateral: -Math.SQRT1_2, forward: Math.SQRT1_2 }, worldMove: { worldX: 0, worldZ: 0 },
    jumpHeld: false, jumpPressed: false, hitHeld: false, hitPressed: false,
    forearmPassHeld: false, forearmPassPressed: false, ...overrides,
  }
}

describe('shadow action capture and clock', () => {
  it.each([
    [true, false, 'GENERIC_HIT'], [false, true, 'FOREARM_PASS'], [true, true, 'FOREARM_PASS'],
  ] as const)('captures hit=%s and pass=%s at step zero, observing %s', (hitPressed, forearmPassPressed, selectedActionType) => {
    const bridge = new ActionIntegrationBridge()
    const capture = vi.spyOn(PlayerActionResolver.prototype, 'capture')
    try {
      bridge.capture([input({ hitPressed, forearmPassPressed })], 0)
      expect(capture.mock.calls.map(([action, step]) => [action.actionType, step])).toEqual([
        ...(hitPressed ? [['GENERIC_HIT', 0]] : []), ...(forearmPassPressed ? [['FOREARM_PASS', 0]] : []),
      ])
      expect(bridge.observeSteps(1)).toEqual([{ playerId: 'a', simulationStep: 0, selectedActionType, pressStep: 0 }])
    } finally {
      capture.mockRestore()
    }
  })

  it.each([true, false])('keeps the earlier command and promotes without renewal when hit first=%s', (hitFirst) => {
    const bridge = new ActionIntegrationBridge()
    const first = hitFirst ? 'GENERIC_HIT' : 'FOREARM_PASS'
    const second = hitFirst ? 'FOREARM_PASS' : 'GENERIC_HIT'
    bridge.capture([input({ hitPressed: hitFirst, forearmPassPressed: !hitFirst })], 0)
    bridge.observeSteps(2)
    bridge.capture([input({ hitPressed: !hitFirst, forearmPassPressed: hitFirst })], 2)
    const observations = bridge.observeSteps(7)
    expect(observations.map(({ simulationStep, selectedActionType, pressStep }) => [simulationStep, selectedActionType, pressStep])).toEqual([
      [2, first, 0], [3, first, 0], [4, first, 0], [5, first, 0], [6, second, 2], [7, second, 2], [8, null, null],
    ])
  })

  it('keeps a zero-step capture on the same step through repeated render samples', () => {
    const bridge = new ActionIntegrationBridge()
    bridge.capture([input({ forearmPassPressed: true })], 10)
    expect(bridge.observeSteps(0)).toEqual([])
    for (let frame = 0; frame < 20; frame += 1) {
      bridge.capture([input({ forearmPassHeld: true })], 10)
      expect(bridge.observeSteps(0)).toEqual([])
      expect(bridge.getSnapshots()).toEqual([{ playerId: 'a', simulationStep: 10, selectedActionType: 'FOREARM_PASS', pressStep: 10 }])
    }
    expect(bridge.observeSteps(3).map(({ simulationStep }) => simulationStep)).toEqual([10, 11, 12])
    bridge.capture([input()], 13)
    expect(bridge.observeSteps(3).at(-1)).toMatchObject({ simulationStep: 15, pressStep: 10 })
    bridge.capture([input()], 16)
    bridge.observeSteps(0)
    expect(bridge.getSnapshots()[0]).toMatchObject({ simulationStep: 16, selectedActionType: null, pressStep: null })
  })

  it.each([true, false])('forwards a new edge and exact local aim on re-press (hit=%s)', (hitPressed) => {
    const bridge = new ActionIntegrationBridge()
    const capture = vi.spyOn(PlayerActionResolver.prototype, 'capture')
    const source = input({ hitPressed, forearmPassPressed: !hitPressed })
    try {
      bridge.capture([source], 0)
      bridge.observeSteps(1)
      bridge.capture([input()], 1)
      bridge.observeSteps(1)
      const aim = { lateral: -0, forward: -0.375 }
      bridge.capture([input({ ...source, localMove: aim, worldMove: { worldX: 1, worldZ: 1 } })], 2)
      expect(capture).toHaveBeenCalledTimes(2)
      expect(capture.mock.lastCall?.[0]).toMatchObject({ aimLateral: -0, aimForward: -0.375 })
      expect(capture.mock.lastCall?.[1]).toBe(2)
      expect(bridge.observeSteps(1)[0]).toMatchObject({ pressStep: 2 })
    } finally {
      capture.mockRestore()
    }
  })

  it('rejects capture rewind even without a press and rejects invalid steps without corrupting state', () => {
    const bridge = new ActionIntegrationBridge()
    bridge.capture([input({ hitPressed: true })], 2)
    bridge.observeSteps(2)
    for (const step of [3, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => bridge.capture([input()], step)).toThrow(RangeError)
    }
    expect(() => bridge.observeSteps(-1)).toThrow(RangeError)
    expect(() => bridge.observeSteps(1.5)).toThrow(RangeError)
    bridge.capture([input()], 4)
    expect(bridge.observeSteps(1)[0]).toMatchObject({ simulationStep: 4, pressStep: 2 })
  })

  it('keeps players independent and snapshots ordered deterministically, preserving both teams’ local aim', () => {
    const capture = vi.spyOn(PlayerActionResolver.prototype, 'capture')
    try {
      const a = input({ hitPressed: true, worldMove: { worldX: -1, worldZ: 1 } })
      const b = input({ playerId: 'b', teamSide: 'B', forearmPassPressed: true, worldMove: { worldX: 1, worldZ: -1 } })
      function run(snapshots: LocalPlayerInputSnapshot[]) {
        const bridge = new ActionIntegrationBridge()
        bridge.capture(snapshots, 0)
        const first = bridge.observeSteps(1)
        bridge.capture([input({ playerId: 'b', hitPressed: true }), input({ forearmPassPressed: true })], 1)
        return [...first, ...bridge.observeSteps(1)]
      }
      const trace = run([a, b])
      expect(trace.map(({ playerId, selectedActionType }) => [playerId, selectedActionType])).toEqual([
        ['a', 'GENERIC_HIT'], ['b', 'FOREARM_PASS'], ['a', 'GENERIC_HIT'], ['b', 'FOREARM_PASS'],
      ])
      expect(run([b, a])).toEqual(trace)
      for (const [action] of capture.mock.calls) {
        expect(action.aimLateral).toBe(-Math.SQRT1_2)
        expect(action.aimForward).toBe(Math.SQRT1_2)
      }
    } finally {
      capture.mockRestore()
    }
  })

  it('returns immutable diagnostics detached from later captures and reset', () => {
    const bridge = new ActionIntegrationBridge()
    bridge.capture([input({ forearmPassPressed: true })], 0)
    const observed = bridge.observeSteps(1)
    const snapshots = bridge.getSnapshots()
    expect(Object.isFrozen(observed)).toBe(true)
    expect(Object.isFrozen(snapshots)).toBe(true)
    expect(Reflect.set(snapshots[0], 'pressStep', 42)).toBe(false)
    bridge.reset()
    expect(bridge.getSnapshots()).toEqual([])
    expect(snapshots[0]).toMatchObject({ selectedActionType: 'FOREARM_PASS', pressStep: 0 })
  })
})

describe('shadow observation with the existing simulator', () => {
  it('clears on an actual ground event, suspends captures, and resets in sync without synthesizing edges', () => {
    const simulator = new FixedStepVolleyballSimulator({
      position: { x: 0, y: VOLLEYBALL_CONFIG.radius + 0.001, z: 0 }, velocity: { x: 0, y: -1, z: 0 },
    })
    const bridge = new ActionIntegrationBridge()
    bridge.capture([input({ forearmPassPressed: true })], simulator.totalSimulationSteps)
    const landing = simulator.advance(3 * STEP)
    expect(landing.executedSteps).toBe(1)
    expect(bridge.observeSteps(landing.executedSteps)[0]).toMatchObject({ simulationStep: 0, pressStep: 0 })
    expect(landing.events.some(({ type }) => type === 'GROUND_CONTACT')).toBe(true)
    bridge.suspend()
    expect(bridge.getSnapshots()[0]).toMatchObject({ selectedActionType: null, pressStep: null })
    bridge.capture([input({ hitPressed: true, forearmPassPressed: true })], simulator.totalSimulationSteps)
    bridge.observeSteps(simulator.advance(STEP).executedSteps)
    expect(bridge.getSnapshots()[0]).toMatchObject({ selectedActionType: null, pressStep: null })
    simulator.reset(initial)
    bridge.reset()
    expect(bridge.getSnapshots()).toEqual([])
    bridge.capture([input({ hitHeld: true, forearmPassHeld: true })], simulator.totalSimulationSteps)
    bridge.observeSteps(0)
    expect(bridge.getSnapshots()[0]).toMatchObject({ simulationStep: 0, selectedActionType: null, pressStep: null })
    bridge.capture([input({ hitPressed: true })], simulator.totalSimulationSteps)
    expect(bridge.observeSteps(1)[0]).toMatchObject({ simulationStep: 0, selectedActionType: 'GENERIC_HIT', pressStep: 0 })
  })

  function replay(fps: number, withObserver: boolean, hit: boolean, pass: boolean) {
    const simulator = new FixedStepVolleyballSimulator(initial)
    const bridge = withObserver ? new ActionIntegrationBridge() : null
    const physicalEvents = []
    const observations = []
    const selectedAfterResponse = []
    const sampledSteps = new Set<number>()
    for (let frame = 0; frame < fps / 5; frame += 1) {
      const step = simulator.totalSimulationSteps
      // Schedule presses at common logical boundaries, delivering each only once at 120 FPS.
      const newSample = !sampledSteps.has(step)
      sampledSteps.add(step)
      const snapshots = [input({
        hitPressed: hit && newSample && step === 0,
        forearmPassPressed: pass && newSample && (step === 0 || step === 2),
      })]
      bridge?.capture(snapshots, step)
      const result = simulator.advance(1 / fps, [contact], snapshots.map(createPlayerHitIntent))
      physicalEvents.push(...result.events)
      observations.push(...(bridge?.observeSteps(result.executedSteps) ?? []))
      if (result.events.some(({ type }) => type === 'PLAYER_CONTACT_RESPONSE')) {
        selectedAfterResponse.push(...(bridge?.getSnapshots() ?? []))
      }
    }
    return { physical: { events: physicalEvents, state: simulator.getState(), steps: simulator.totalSimulationSteps }, observations, selectedAfterResponse }
  }

  it.each([[true, false], [false, true], [true, true]] as const)('keeps physical state and events identical with or without observation for hit=%s and pass=%s', (hit, pass) => {
    const shadow = replay(60, true, hit, pass)
    expect(shadow.physical).toEqual(replay(60, false, hit, pass).physical)
    expect(shadow.physical.events.filter(({ type }) => type === 'PLAYER_CONTACT_RESPONSE')).toHaveLength(hit ? 1 : 0)
    expect(shadow.physical).toEqual(replay(60, false, hit, false).physical)
  })

  it('does not consume priority when the legacy hit responds', () => {
    const consume = vi.spyOn(PlayerActionResolver.prototype, 'consume')
    try {
      const result = replay(60, true, true, true)
      expect(result.selectedAfterResponse[0]).toMatchObject({ selectedActionType: 'FOREARM_PASS', pressStep: 0 })
      expect(result.observations[1]).toMatchObject({ simulationStep: 1, selectedActionType: 'FOREARM_PASS', pressStep: 0 })
      expect(consume).not.toHaveBeenCalled()
    } finally {
      consume.mockRestore()
    }
  })

  it('replays the same physical and temporal observations at 30, 60 and 120 FPS for the same logical captures', () => {
    const expected = replay(60, true, true, true)
    expect(expected.physical.steps).toBe(12)
    expect(expected.observations.map(({ simulationStep }) => simulationStep)).toEqual(Array.from({ length: 12 }, (_, step) => step))
    for (const fps of [30, 60, 120]) {
      const actual = replay(fps, true, true, true)
      expect(actual.physical).toEqual(expected.physical)
      expect(actual.observations).toEqual(expected.observations)
    }
  })

  it('leaves existing movement and jump snapshots and results unchanged', () => {
    const snapshots = [input({ jumpPressed: true, jumpHeld: true, forearmPassPressed: true, worldMove: { worldX: 1, worldZ: 0 } })]
    const original = structuredClone(snapshots)
    function run(withObserver: boolean) {
      const position = { x: 0, y: 0, z: -4.5 }
      const movement = new PlayerMovementController([{ ...contact, position }])
      const bridge = withObserver ? new ActionIntegrationBridge() : null
      bridge?.capture(snapshots, 0)
      movement.update(snapshots, STEP)
      bridge?.observeSteps(1)
      return { position, state: movement.getPlayerState('a') }
    }
    const actual = run(true)
    expect(actual).toEqual(run(false))
    expect(actual.position.x).toBeGreaterThan(0)
    expect(actual.position.y).toBeGreaterThan(0)
    expect(snapshots).toEqual(original)
  })
})
