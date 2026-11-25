import { describe, expect, it, vi } from 'vitest'
import type { PlayerCommandIntent } from '@/game/actions/playerActionResolver'
import type { TipIntent } from '@/game/actions/tipIntent'
import { FixedStepVolleyballSimulator } from '@/game/ball/FixedStepVolleyballSimulator'
import { VOLLEYBALL_CONFIG } from '@/game/ball/volleyballConfig'
import { VOLLEYBALL_SIMULATION_CONFIG } from '@/game/ball/volleyballSimulationConfig'
import { stepVolleyballFreeFlight } from '@/game/ball/volleyballSimulationMath'
import type { VolleyballState } from '@/game/ball/volleyballState'
import type { PlayerBallContactTarget } from '@/game/contact/playerBallContact'
import * as tipSolver from '@/game/contact/tipBallisticSolver'
import type { TeamSide } from '@/game/team/teamTypes'

const { fixedStepSeconds: STEP, gravity } = VOLLEYBALL_SIMULATION_CONFIG
const initial: VolleyballState = {
  position: { x: 0, y: 2.65, z: -0.5 },
  velocity: { x: 0, y: 0, z: 0 },
}

function tip(playerId = 'a', teamSide: TeamSide = 'A', lateral = 0, forward = 0): TipIntent {
  return { playerId, teamSide, actionType: 'TIP', tipPressed: true, aimLateral: lateral, aimForward: forward }
}

function action(type: 'SPIKE' | 'SET' | 'FOREARM_PASS' | 'GENERIC_HIT', playerId = 'a'): PlayerCommandIntent {
  const common = { playerId, teamSide: 'A' as const, aimLateral: 0, aimForward: 0 }
  switch (type) {
    case 'SPIKE': return { ...common, actionType: type, spikePressed: true }
    case 'SET': return { ...common, actionType: type, setHeld: true, setPressed: true }
    case 'FOREARM_PASS': return { ...common, actionType: type, forearmPassHeld: true, forearmPassPressed: true }
    case 'GENERIC_HIT': return { ...common, actionType: type, hitHeld: true, hitPressed: true }
  }
}

function pose(overrides: Partial<PlayerBallContactTarget> = {}): PlayerBallContactTarget {
  return { playerId: 'a', teamSide: 'A', position: { x: 0, y: 0.85, z: -0.5 }, grounded: false, ...overrides }
}

function startingStateForContact(
  contactPosition: VolleyballState['position'],
  incomingVelocity: VolleyballState['velocity'],
  elapsed = STEP,
): VolleyballState {
  return {
    position: {
      x: contactPosition.x - incomingVelocity.x * elapsed,
      y: contactPosition.y - incomingVelocity.y * elapsed - gravity * elapsed * elapsed / 2,
      z: contactPosition.z - incomingVelocity.z * elapsed,
    },
    velocity: { ...incomingVelocity, y: incomingVelocity.y + gravity * elapsed },
  }
}

describe('TIP in the authoritative fixed-step simulator', () => {
  it.each(['A', 'B'] as const)('applies Team %s TIP once from the unchanged response position with immutable telemetry', (team) => {
    const sign = team === 'A' ? 1 : -1
    const start = { ...initial, position: { ...initial.position, z: -sign * 0.5 } }
    const target = pose({ teamSide: team, position: { x: 0, y: 0.85, z: -sign * 0.5 } })
    const sim = new FixedStepVolleyballSimulator(start)
    const solver = vi.spyOn(tipSolver, 'solveTipBallisticTrajectory')
    try {
      const result = sim.advanceWithActions(STEP, [target], [tip('a', team, 0.25, -0.5)])
      expect(result.events.map(({ type }) => type)).toEqual(['PLAYER_CONTACT', 'PLAYER_TIP_RESPONSE'])
      const event = result.events.find((event) => event.type === 'PLAYER_TIP_RESPONSE')!
      expect(solver).toHaveBeenCalledTimes(1)
      expect(solver).toHaveBeenCalledWith(stepVolleyballFreeFlight(start, STEP).position, team, 0.25, -0.5)
      expect(event).toMatchObject({
        type: 'PLAYER_TIP_RESPONSE', actionType: 'TIP', playerId: 'a', teamSide: team,
        pressStep: 0, contactStep: 0, responseStep: 0, timingGrade: 'PERFECT',
        aimLateral: 0.25, aimForward: -0.5,
        targetPosition: { x: sign * 0.5, y: 0.105, z: sign * (1.9 - 1.1 / 2) },
        ballPosition: stepVolleyballFreeFlight(start, STEP).position,
        outgoingVelocity: sim.getState().velocity,
      })
      expect(sim.getState().position).toEqual(stepVolleyballFreeFlight(start, STEP).position)
      expect(result.lastActionStep.executedAction?.outgoingVelocity).toEqual(event.outgoingVelocity)
      expect(result.lastActionStep.selectedActions[0]).toBe(result.lastActionStep.executedAction?.action)
      for (const value of [event, event.ballPosition, event.incomingVelocity, event.outgoingVelocity, event.targetPosition, event.admissibleTimeInterval]) {
        expect(Object.isFrozen(value)).toBe(true)
      }
    } finally { solver.mockRestore() }
  })

  it.each([
    [true, 'GROUNDED'], [undefined, 'POSE_UNAVAILABLE'],
  ] as const)('rejects grounded=%s without a synthetic response or responded-overlap lock', (grounded, reason) => {
    const sim = new FixedStepVolleyballSimulator(initial)
    const rejected = sim.advanceWithActions(STEP, [pose({ grounded })], [tip()])
    expect(rejected.events.map(({ type }) => type)).toEqual(['PLAYER_CONTACT'])
    expect(rejected.lastActionStep.executedAction).toBeNull()
    expect(rejected.lastActionStep.rejectedActions).toEqual([
      { playerId: 'a', actionType: 'TIP', pressStep: 0, responseStep: 0, reason },
    ])
    expect(sim.getState()).toEqual(stepVolleyballFreeFlight(initial, STEP))
    expect(sim.advanceWithActions(STEP, [pose()]).events).toEqual([])
    const renewed = sim.advanceWithActions(STEP, [pose()], [tip()])
    expect(renewed.events.map(({ type }) => type)).toEqual(['PLAYER_TIP_RESPONSE'])
    expect(renewed.events[0]).toMatchObject({ pressStep: 2, contactStep: 0, responseStep: 2, timingGrade: 'LATE' })
  })

  it.each([
    ['INVALID_GEOMETRY', { x: 0, y: 2.65, z: 0.5 }, 0],
    ['INVALID_TARGET', { x: 3.5, y: 2.65, z: -0.5 }, 1],
    ['NO_ADMISSIBLE_TRAJECTORY', { x: 0, y: 1.5, z: 0 }, 0],
  ] as const)('records %s and leaves the free-flight velocity intact', (reason, position, aim) => {
    const state = { position, velocity: { x: 0, y: 0, z: 0 } }
    const sim = new FixedStepVolleyballSimulator(state)
    const target = pose({ position: { x: position.x, y: position.y > 2 ? 0.85 : 0, z: position.z } })
    const result = sim.advanceWithActions(STEP, [target], [tip('a', 'A', aim)])
    expect(result.events.map(({ type }) => type)).toEqual(['PLAYER_CONTACT'])
    expect(result.lastActionStep.executedAction).toBeNull()
    expect(result.lastActionStep.rejectedActions).toMatchObject([{ actionType: 'TIP', reason }])
    expect(sim.getState()).toEqual(stepVolleyballFreeFlight(state, STEP))
    expect(sim.advanceWithActions(0).lastActionStep.selectedActions).toEqual([])
  })

  it.each(['FOREARM_PASS', 'GENERIC_HIT'] as const)('reselects an explicitly pending %s after physically infeasible TIP', (fallback) => {
    const start = { position: { x: 0, y: 1.5, z: 0 }, velocity: { x: 0, y: 0, z: 0 } }
    const sim = new FixedStepVolleyballSimulator(start)
    const target = pose({ position: { x: 0, y: 0, z: 0 } })
    const result = sim.advanceWithActions(STEP, [target], [action(fallback), tip()])
    expect(result.lastActionStep.selectedActions[0].actionType).toBe('TIP')
    expect(result.lastActionStep.rejectedActions).toMatchObject([{ actionType: 'TIP', reason: 'NO_ADMISSIBLE_TRAJECTORY' }])
    expect(result.lastActionStep.executedAction?.action.actionType).toBe(fallback)
    expect(result.events.map(({ type }) => type)).toEqual([
      'PLAYER_CONTACT', fallback === 'FOREARM_PASS' ? 'PLAYER_FOREARM_PASS_RESPONSE' : 'PLAYER_CONTACT_RESPONSE',
    ])
  })

  it('rejects SPIKE then TIP on the same grounded pose, executes SET and preserves another player', () => {
    const low = { position: { x: 0, y: 1, z: -0.5 }, velocity: { x: 0, y: 0, z: 0 } }
    const sim = new FixedStepVolleyballSimulator(low)
    const ground = pose({ grounded: true, position: { x: 0, y: 0, z: -0.5 } })
    const result = sim.advanceWithActions(STEP, [ground, { ...ground, playerId: 'b' }], [
      action('SET'), tip(), action('SPIKE'), tip('b'),
    ])
    expect(result.lastActionStep.rejectedActions).toEqual([
      { playerId: 'a', actionType: 'SPIKE', pressStep: 0, responseStep: 0, reason: 'GROUNDED' },
      { playerId: 'a', actionType: 'TIP', pressStep: 0, responseStep: 0, reason: 'GROUNDED' },
    ])
    expect(result.lastActionStep.selectedActions.map(({ playerId, actionType }) => [playerId, actionType]))
      .toEqual([['a', 'SPIKE'], ['b', 'TIP']])
    expect(result.lastActionStep.executedAction?.action.actionType).toBe('SET')
    expect(result.events.map(({ type }) => type)).toEqual(['PLAYER_CONTACT', 'PLAYER_CONTACT', 'PLAYER_SET_RESPONSE'])
    expect(sim.advanceWithActions(0).lastActionStep.selectedActions).toMatchObject([{ playerId: 'b', actionType: 'TIP' }])
    expect(Object.isFrozen(result.lastActionStep.rejectedActions)).toBe(true)
    expect(result.lastActionStep.rejectedActions?.every(Object.isFrozen)).toBe(true)
  })

  it.each([[0, true], [5, true], [6, false]] as const)('keeps a no-overlap capture at age %s eligible=%s', (age, eligible) => {
    const sim = new FixedStepVolleyballSimulator(initial)
    sim.advanceWithActions(0, [], [tip()])
    for (let index = 0; index < age; index += 1) sim.advanceWithActions(STEP)
    const result = sim.advanceWithActions(STEP, [pose()])
    expect(result.events.some(({ type }) => type === 'PLAYER_TIP_RESPONSE')).toBe(eligible)
    expect(result.lastActionStep.executedAction?.action.actionType ?? null).toBe(eligible ? 'TIP' : null)
    if (eligible) expect(result.lastActionStep.executedAction?.action.pressStep).toBe(0)
    else expect(result.lastActionStep.selectedActions).toEqual([])
  })

  it('follows target order rather than global type or player-id priority, with only one response per tick', () => {
    const sim = new FixedStepVolleyballSimulator(initial)
    const first = pose({ playerId: 'z' })
    const second = pose({ playerId: 'a' })
    const result = sim.advanceWithActions(STEP, [first, second], [tip('a'), tip('z')])
    expect(result.lastActionStep.selectedActions.map(({ playerId }) => playerId)).toEqual(['a', 'z'])
    expect(result.lastActionStep.executedAction?.action.playerId).toBe('z')
    expect(result.events.filter(({ type }) => type === 'PLAYER_TIP_RESPONSE')).toHaveLength(1)
    const next = sim.advanceWithActions(STEP, [first, second])
    expect(next.lastActionStep.executedAction?.action.playerId).toBe('a')
    expect(next.events.filter(({ type }) => type === 'PLAYER_TIP_RESPONSE')).toHaveLength(1)
  })

  it('locks a responded overlap, ignores fresh presses there and permits the original TIP after exit/reentry', () => {
    const sim = new FixedStepVolleyballSimulator(initial)
    sim.advanceWithActions(0, [], [action('SET')])
    sim.advanceWithActions(STEP)
    const first = sim.advanceWithActions(STEP, [pose()], [tip()])
    expect(first.lastActionStep.executedAction?.action.actionType).toBe('SET')
    const trackingPose = () => {
      const { position } = sim.getState()
      return pose({ position: { ...position, y: position.y - 1.4 } })
    }
    expect(sim.advanceWithActions(STEP, [trackingPose()], [tip('a', 'A', 1)]).events).toEqual([])
    expect(sim.advanceWithActions(STEP).events).toEqual([])
    const reentry = sim.advanceWithActions(STEP, [trackingPose()])
    expect(reentry.events.map(({ type }) => type)).toEqual(['PLAYER_CONTACT', 'PLAYER_TIP_RESPONSE'])
    expect(reentry.events[1]).toMatchObject({ pressStep: 1, contactStep: 4, responseStep: 4, aimLateral: 0 })
  })

  it('gives ground precedence, invalidates TIP on reset and preserves the legacy route', () => {
    const impact = { position: { x: 0, y: VOLLEYBALL_CONFIG.radius + 0.001, z: -0.5 }, velocity: { x: 0, y: -1, z: 0 } }
    const sim = new FixedStepVolleyballSimulator(impact)
    const target = pose({ position: { x: 0, y: 0, z: -0.5 } })
    const result = sim.advanceWithActions(2 * STEP, [target], [tip()])
    expect(result.events.map(({ type }) => type)).toEqual(['PLAYER_CONTACT', 'GROUND_CONTACT'])
    expect(result.lastActionStep).toEqual({ simulationStep: 0, selectedActions: [], executedAction: null })
    expect(sim.advanceWithActions(STEP, [target], [tip()]).executedSteps).toBe(0)
    sim.reset(initial)
    expect(sim.advanceWithActions(0).lastActionStep.selectedActions).toEqual([])
    sim.reset({ position: { x: 0, y: 1, z: -0.5 }, velocity: { x: 0, y: 0, z: 0 } })
    const legacy = sim.advance(STEP, [target], [{ playerId: 'a', hitHeld: true, hitPressed: true, aimLateral: 0, aimForward: 0 }])
    expect(legacy.events.map(({ type }) => type)).toEqual(['PLAYER_CONTACT', 'PLAYER_CONTACT_RESPONSE'])
  })

  it.each(['A', 'B'] as const)('lands Team %s TIP at its predicted destination through actual uninterrupted fixed steps', (team) => {
    const sign = team === 'A' ? 1 : -1
    const start = { ...initial, position: { ...initial.position, z: -sign * 0.5 } }
    const sim = new FixedStepVolleyballSimulator(start)
    const result = sim.advanceWithActions(STEP, [pose({ teamSide: team, position: { x: 0, y: 0.85, z: -sign * 0.5 } })], [tip('a', team, 0.5, -0.5)])
    const event = result.events.find((event) => event.type === 'PLAYER_TIP_RESPONSE')!
    expect(event).toBeDefined()
    const subsequent = Array.from({ length: 100 }, () => sim.advanceWithActions(STEP).events).flat()
    const landing = subsequent.find((event) => event.type === 'GROUND_CONTACT')!
    expect(landing).toBeDefined()
    expect(subsequent.filter(({ type }) => type === 'GROUND_CONTACT')).toHaveLength(1)
    expect(subsequent.filter(({ type }) => type === 'PLAYER_TIP_RESPONSE')).toHaveLength(0)
    expect(Math.hypot(landing.position.x - event.targetPosition.x, landing.position.y - event.targetPosition.y, landing.position.z - event.targetPosition.z)).toBeLessThanOrEqual(1e-9)
    expect(landing.velocity.y).toBeLessThan(0)
    expect(landing).toMatchObject({ courtResult: 'IN', courtSide: team === 'A' ? 'B' : 'A' })
  })

  it('records different timing grades without changing TIP physics for identical contact geometry', () => {
    const start = startingStateForContact(initial.position, initial.velocity, 3 * STEP)
    const early = new FixedStepVolleyballSimulator(start)
    const late = new FixedStepVolleyballSimulator(start)
    early.advanceWithActions(0, [], [tip('a', 'A', 0.5, -0.5)])
    early.advanceWithActions(2 * STEP)
    late.advanceWithActions(2 * STEP, [pose()])
    const e = early.advanceWithActions(STEP, [pose()]).events.find((event) => event.type === 'PLAYER_TIP_RESPONSE')!
    const l = late.advanceWithActions(STEP, [pose()], [tip('a', 'A', 0.5, -0.5)]).events.find((event) => event.type === 'PLAYER_TIP_RESPONSE')!
    expect(e.timingGrade).toBe('EARLY')
    expect(l.timingGrade).toBe('LATE')
    expect(e.ballPosition).toEqual(l.ballPosition)
    expect(e.outgoingVelocity).toEqual(l.outgoingVelocity)
    expect(e.targetPosition).toEqual(l.targetPosition)
    expect(e.flightTimeSeconds).toBe(l.flightTimeSeconds)
  })

  it('retains no component of incoming velocity when the response geometry and captured aim are unchanged', () => {
    const responses = [{ x: 0, y: 0, z: 0 }, { x: 4, y: -2, z: 6 }].map((incoming) => {
      const sim = new FixedStepVolleyballSimulator(startingStateForContact(initial.position, incoming))
      const response = sim.advanceWithActions(STEP, [pose()], [tip('a', 'A', 0.25, 0)]).events.find((event) => event.type === 'PLAYER_TIP_RESPONSE')!
      for (const axis of ['x', 'y', 'z'] as const) expect(response.incomingVelocity[axis]).toBeCloseTo(incoming[axis], 12)
      return response
    })
    for (const axis of ['x', 'y', 'z'] as const) {
      expect(responses[1].outgoingVelocity[axis]).toBeCloseTo(responses[0].outgoingVelocity[axis], 12)
      expect(responses[1].targetPosition[axis]).toBeCloseTo(responses[0].targetPosition[axis], 12)
    }
  })

  it.each([NaN, Infinity, -Infinity, 1.01, -1.01])('rejects invalid captured TIP aim %s before state or captures change', (aim) => {
    const sim = new FixedStepVolleyballSimulator(initial)
    expect(() => sim.advanceWithActions(STEP, [pose()], [tip('a', 'A', aim)])).toThrow(RangeError)
    expect(sim.getState()).toEqual(initial)
    expect(sim.totalSimulationSteps).toBe(0)
    expect(sim.advanceWithActions(0).lastActionStep.selectedActions).toEqual([])
  })
})
