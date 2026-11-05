import { describe, expect, it } from 'vitest'
import { createFrameActionIntents } from '@/game/actions/actionIntegrationBridge'
import type { PlayerCommandIntent, ResolvableActionType } from '@/game/actions/playerActionResolver'
import type { BallSimulationEvent } from '@/game/ball/ballGroundContact'
import { FixedStepVolleyballSimulator, type ActionStepObservation } from '@/game/ball/FixedStepVolleyballSimulator'
import { VOLLEYBALL_CONFIG } from '@/game/ball/volleyballConfig'
import { VOLLEYBALL_SIMULATION_CONFIG } from '@/game/ball/volleyballSimulationConfig'
import type { LocalPlayerInputSnapshot } from '@/game/input/inputTypes'
import type { TeamSide } from '@/game/team/teamTypes'

const STEP = VOLLEYBALL_SIMULATION_CONFIG.fixedStepSeconds
const INITIAL = { position: { x: 0, y: 1, z: 0 }, velocity: { x: 0.25, y: 0, z: 0 } }
const HIT = 'GENERIC_HIT'
const PASS = 'FOREARM_PASS'
const target = (playerId = 'a', teamSide: TeamSide = 'A', x = 0, z = 0) => ({ playerId, teamSide, position: { x, y: 0, z } })
const responseType = (type: ResolvableActionType) => type === PASS ? 'PLAYER_FOREARM_PASS_RESPONSE' : 'PLAYER_CONTACT_RESPONSE'

function command(actionType: ResolvableActionType, playerId = 'a', aimLateral = 0, aimForward = 0): PlayerCommandIntent {
  return actionType === HIT
    ? { actionType, playerId, aimLateral, aimForward, hitHeld: true, hitPressed: true }
    : { actionType, playerId, aimLateral, aimForward, forearmPassHeld: true, forearmPassPressed: true }
}

function responses(events: readonly BallSimulationEvent[]) {
  return events.filter((event) => event.type === 'PLAYER_CONTACT_RESPONSE' || event.type === 'PLAYER_FOREARM_PASS_RESPONSE')
}

function nearby(sim: FixedStepVolleyballSimulator) {
  const { x, z } = sim.getState().position
  return target('a', 'A', x, z)
}

describe('action capture and authoritative contact selection', () => {
  it.each([
    [[HIT], HIT, 6.3, 5], [[PASS], PASS, 5, 3.5], [[HIT, PASS], PASS, 5, 3.5], [[PASS, HIT], PASS, 5, 3.5],
  ] as const)('executes %j as %s, emitting exactly one response and consuming only that action', (types, winner, y, z) => {
    const sim = new FixedStepVolleyballSimulator(INITIAL)
    const result = sim.advanceWithActions(STEP, [target()], types.map((type) => command(type)))
    expect(result.events.map(({ type }) => type)).toEqual(['PLAYER_CONTACT', responseType(winner)])
    expect(responses(result.events)[0].outgoingVelocity).toEqual({ x: 0.25, y, z })
    expect(responses(result.events)[0].outgoingVelocity).toEqual(sim.getState().velocity)
    expect(result.lastActionStep).toMatchObject({
      simulationStep: 0,
      selectedActions: [{ playerId: 'a', actionType: winner, pressStep: 0 }],
      executedAction: { action: { playerId: 'a', actionType: winner, pressStep: 0 }, responseStep: 0, timingGrade: 'PERFECT' },
    })
    const pending = sim.advanceWithActions(0)
    expect(pending.actionSteps).toEqual([])
    expect(pending.lastActionStep.selectedActions.map(({ actionType }) => actionType)).toEqual(types.length === 2 ? [HIT] : [])
  })

  it('uses the actual frame bridge to capture E and Q independently for different players', () => {
    const input: LocalPlayerInputSnapshot = {
      playerId: 'a', teamSide: 'A', deviceKind: 'keyboard', deviceName: 'Keyboard', deviceConnected: true,
      jumpHeld: false, jumpPressed: false, localMove: { lateral: -0.25, forward: 0.5 }, worldMove: { worldX: -1, worldZ: -1 },
      hitPressed: true, hitHeld: true, forearmPassPressed: true, forearmPassHeld: true,
    }
    const intents = createFrameActionIntents([input, { ...input, playerId: 'b', teamSide: 'B', forearmPassPressed: false }])
    expect(intents.map(({ playerId, actionType }) => [playerId, actionType])).toEqual([['a', HIT], ['a', PASS], ['b', HIT]])
    const sim = new FixedStepVolleyballSimulator(INITIAL)
    const result = sim.advanceWithActions(STEP, [target()], intents)
    expect(responses(result.events)[0]).toMatchObject({ type: responseType(PASS), aimLateral: -0.25, aimForward: 0.5 })
    expect(sim.advanceWithActions(0).lastActionStep.selectedActions.map(({ playerId, actionType }) => [playerId, actionType])).toEqual([['a', HIT], ['b', HIT]])
  })

  it.each([[HIT, PASS], [PASS, HIT]] as const)('keeps %s ahead of later %s until it expires', (first, later) => {
    const sim = new FixedStepVolleyballSimulator(INITIAL)
    sim.advanceWithActions(2 * STEP, [], [command(first)])
    const frame = sim.advanceWithActions(STEP, [target()], [command(later)])
    expect(responses(frame.events)[0].type).toBe(responseType(first))
    expect(frame.lastActionStep.executedAction?.action.pressStep).toBe(0)
    expect(sim.advanceWithActions(0).lastActionStep.selectedActions[0]).toMatchObject({ actionType: later, pressStep: 2 })
  })

  it.each([[HIT, PASS], [PASS, HIT]] as const)('re-press replaces only %s, preserving %s and the other player', (repressed, earlier) => {
    const sim = new FixedStepVolleyballSimulator(INITIAL)
    sim.advanceWithActions(STEP, [], [command(repressed), command(PASS, 'b')])
    sim.advanceWithActions(STEP, [], [command(earlier, 'a', -0.5, 0.375)])
    const atTwo = sim.advanceWithActions(0, [], [command(repressed, 'a', 0.75, -0.25)])
    expect(atTwo.lastActionStep.selectedActions).toMatchObject([
      { playerId: 'a', actionType: earlier, pressStep: 1, aimLateral: -0.5, aimForward: 0.375 },
      { playerId: 'b', actionType: PASS, pressStep: 0 },
    ])
    const response = sim.advanceWithActions(STEP, [target()])
    expect(response.lastActionStep.executedAction?.action.actionType).toBe(earlier)
    expect(sim.advanceWithActions(0).lastActionStep.selectedActions[0]).toMatchObject({ actionType: repressed, pressStep: 2, aimLateral: 0.75, aimForward: -0.25 })
  })

  it.each([NaN, Infinity, -Infinity, 1.01, -1.01])('rejects invalid captured aim %s before motion or replacing a valid capture', (bad) => {
    const sim = new FixedStepVolleyballSimulator(INITIAL)
    const capture = sim.advanceWithActions(0, [], [command(PASS, 'a', 0.5, -0.25)]).lastActionStep.selectedActions
    expect(() => sim.advanceWithActions(STEP, [target()], [command(PASS, 'a', bad, 0)])).toThrow(RangeError)
    expect(() => sim.advanceWithActions(STEP, [target()], [command(HIT), command(PASS, 'a', 0, bad)])).toThrow(RangeError)
    expect(sim.totalSimulationSteps).toBe(0)
    expect(sim.getState()).toEqual(INITIAL)
    expect(sim.advanceWithActions(0).lastActionStep.selectedActions).toEqual(capture)
  })

  it.each(['A', 'B'] as const)('uses the real entry step for late Team %s passes and snapshots the applied response', (teamSide) => {
    const sim = new FixedStepVolleyballSimulator(INITIAL)
    expect(sim.advanceWithActions(2 * STEP, [target('a', teamSide)]).events.map(({ type }) => type)).toEqual(['PLAYER_CONTACT'])
    const result = sim.advanceWithActions(STEP, [target('a', teamSide)], [command(PASS, 'a', 1, 1)])
    expect(result.events).toHaveLength(1)
    const event = responses(result.events)[0]
    expect(event).toMatchObject({ type: responseType(PASS), actionType: PASS, teamSide, contactStep: 0, pressStep: 2,
      timingOffsetSteps: 2, timingOffsetSeconds: 2 * STEP, timingGrade: 'LATE', timingPowerMultiplier: 0.9, timingAccuracyMultiplier: 0.85,
      aimLateral: 1, aimForward: 1, effectiveAimLateral: 0.85, effectiveAimForward: 0.85,
    })
    const sign = teamSide === 'A' ? 1 : -1
    expect(event.outgoingVelocity).toEqual({ x: 0.25 + sign * 1.7, y: 5, z: sign * 4.425 })
    expect(event.outgoingVelocity).toEqual(sim.getState().velocity)
    expect(result.lastActionStep.executedAction?.responseStep).toBe(2)
    const snapshot = structuredClone(event)
    sim.advanceWithActions(STEP)
    expect(event).toEqual(snapshot)
  })
})

describe('action buffer, overlap and lifecycle', () => {
  it.each([[HIT, 5, true], [PASS, 5, true], [HIT, 6, false], [PASS, 6, false]] as const)('checks %s at age %s (eligible=%s)', (type, age, eligible) => {
    const sim = new FixedStepVolleyballSimulator(INITIAL)
    const zero = sim.advanceWithActions(0, [target()], [command(type, 'a', -0.25, 0.5)])
    expect(zero).toMatchObject({ executedSteps: 0, events: [], actionSteps: [] })
    for (let i = 0; i < 10; i += 1) {
      expect(sim.advanceWithActions(0).lastActionStep.selectedActions[0]).toMatchObject({ pressStep: 0, actionType: type })
    }
    expect(sim.advanceWithActions(age * STEP).executedSteps).toBe(age)
    const result = sim.advanceWithActions(STEP, [target()])
    expect(result.lastActionStep.simulationStep).toBe(age)
    expect(responses(result.events)).toHaveLength(eligible ? 1 : 0)
    if (eligible) expect(result.lastActionStep.executedAction).toMatchObject({ action: { pressStep: 0, aimLateral: -0.25, aimForward: 0.5 }, timingGrade: 'VERY_EARLY' })
  })

  it('promotes an unexpired candidate at step 6 without renewing it at step 8', () => {
    const sim = new FixedStepVolleyballSimulator(INITIAL)
    sim.advanceWithActions(2 * STEP, [], [command(HIT)])
    const frame = sim.advanceWithActions(6 * STEP, [], [command(PASS)])
    expect(frame.actionSteps.map(({ selectedActions }) => selectedActions[0]?.actionType)).toEqual([HIT, HIT, HIT, HIT, PASS, PASS])
    expect(frame.actionSteps[4].selectedActions[0].pressStep).toBe(2)
    expect(responses(frame.events)).toEqual([])
    expect(responses(sim.advanceWithActions(STEP, [target()]).events)).toEqual([])
  })

  it('executes a promoted action on a later substep of the same frame', () => {
    // Overlap begins on step 6, the second substep of the last frame.
    const sim = new FixedStepVolleyballSimulator({ ...INITIAL, position: { x: 0, y: 1, z: -1.03 }, velocity: { x: 0, y: 0, z: 6 } })
    sim.advanceWithActions(2 * STEP, [], [command(HIT)])
    sim.advanceWithActions(3 * STEP, [], [command(PASS)])
    const frame = sim.advanceWithActions(2 * STEP, [target()])
    expect(frame.actionSteps[0]).toMatchObject({ simulationStep: 5, selectedActions: [{ actionType: HIT }], executedAction: null })
    expect(frame.actionSteps[1]).toMatchObject({ simulationStep: 6, selectedActions: [{ actionType: PASS }], executedAction: { responseStep: 6, action: { pressStep: 2 } } })
    expect(responses(frame.events)[0]).toMatchObject({ type: responseType(PASS), contactStep: 6, pressStep: 2 })
  })

  it('keeps the remaining candidate locked during continuous overlap, then allows valid reentry', () => {
    const sim = new FixedStepVolleyballSimulator(INITIAL)
    sim.advanceWithActions(STEP, [target()], [command(HIT), command(PASS)])
    const repeat = sim.advanceWithActions(2 * STEP, [nearby(sim)], [command(HIT, 'a', 1, 1), command(PASS)])
    expect(responses(repeat.events)).toEqual([])
    expect(repeat.lastActionStep.selectedActions[0]).toMatchObject({ actionType: HIT, pressStep: 0, aimLateral: 0 })
    sim.advanceWithActions(STEP)
    const reentry = sim.advanceWithActions(STEP, [nearby(sim)])
    expect(reentry.events.map(({ type }) => type)).toEqual(['PLAYER_CONTACT', responseType(HIT)])
    expect(reentry.lastActionStep.executedAction?.action.pressStep).toBe(0)
  })

  it.each([['a', 'b'], ['b', 'a']] as const)('preserves target order %s before %s independently of input order', (first, second) => {
    const sim = new FixedStepVolleyballSimulator(INITIAL)
    const result = sim.advanceWithActions(2 * STEP, [target(first), target(second)], [command(PASS, 'b'), command(HIT, 'a')])
    expect(result.actionSteps.map(({ executedAction }) => executedAction?.action.playerId)).toEqual([first, second])
    expect(responses(result.events).map(({ playerId, type }) => [playerId, type])).toEqual([
      [first, responseType(first === 'a' ? HIT : PASS)], [second, responseType(second === 'a' ? HIT : PASS)],
    ])
    expect(sim.advanceWithActions(0).lastActionStep.selectedActions).toEqual([])
  })

  it('ground takes precedence, clears both actions and blocks input until reset', () => {
    const low = { position: { x: 0, y: VOLLEYBALL_CONFIG.radius + 0.001, z: 0 }, velocity: { x: 0, y: -1, z: 0 } }
    const sim = new FixedStepVolleyballSimulator(low)
    const legacy = new FixedStepVolleyballSimulator(low)
    const landing = sim.advanceWithActions(3 * STEP, [target()], [command(HIT), command(PASS)])
    expect(landing.events).toEqual(legacy.advance(3 * STEP, [target()]).events)
    expect(landing.events.at(-1)?.type).toBe('GROUND_CONTACT')
    expect(landing.executedSteps).toBe(1)
    expect(landing.lastActionStep).toEqual({ simulationStep: 0, selectedActions: [], executedAction: null })
    expect(sim.advanceWithActions(STEP, [target()], [command(PASS)])).toMatchObject({ executedSteps: 0, events: [], lastActionStep: { selectedActions: [] } })
    sim.reset(INITIAL)
    expect(sim.totalSimulationSteps).toBe(0)
    expect(sim.advanceWithActions(STEP, [target()]).events.map(({ type }) => type)).toEqual(['PLAYER_CONTACT'])
    expect(responses(sim.advanceWithActions(STEP, [target()], [command(PASS)]).events)).toHaveLength(1)
  })

  it('disallows mixing routes in one session and resets both modes and pending actions', () => {
    const sim = new FixedStepVolleyballSimulator(INITIAL)
    sim.advanceWithActions(0, [], [command(PASS), command(HIT)])
    expect(() => sim.advance(STEP)).toThrow('before changing its response mode')
    sim.reset(INITIAL)
    expect(sim.advance(STEP, [target()]).events.map(({ type }) => type)).toEqual(['PLAYER_CONTACT'])
    expect(() => sim.advanceWithActions(STEP)).toThrow('before changing its response mode')
    sim.reset(INITIAL)
    expect(sim.advanceWithActions(STEP, [target()]).events.map(({ type }) => type)).toEqual(['PLAYER_CONTACT'])
  })
})

describe('legacy generic parity and fixed-step determinism', () => {
  it.each(['A', 'B'] as const)('reproduces legacy generic events, timing and state for Team %s across the buffer lifecycle', (team) => {
    const legacy = new FixedStepVolleyballSimulator(INITIAL)
    const actions = new FixedStepVolleyballSimulator(INITIAL)
    const near = [target('a', team)]
    function frame(dt: number, inContact: boolean, edge = false, lateral = 0, forward = 0) {
      const targets = inContact ? near : []
      const old = legacy.advance(dt, targets, edge ? [{ playerId: 'a', hitHeld: true, hitPressed: true, aimLateral: lateral, aimForward: forward }] : [])
      const next = actions.advanceWithActions(dt, targets, edge ? [command(HIT, 'a', lateral, forward)] : [])
      expect(next.executedSteps).toBe(old.executedSteps)
      expect(next.events).toEqual(old.events)
      expect(actions.getState()).toEqual(legacy.getState())
      return responses(old.events)
    }
    frame(0, false, true, -0.25, 0.375)
    frame(2 * STEP, false)
    frame(STEP, false, true, 0.375, -0.25)
    expect(frame(STEP, true)).toHaveLength(1)
    expect(frame(0, true, true)).toHaveLength(0)
    expect(frame(STEP, true, true)).toHaveLength(0)
    frame(STEP, false)
    expect(frame(STEP, true)).toHaveLength(0)
    for (const age of [5, 6]) {
      legacy.reset(INITIAL)
      actions.reset(INITIAL)
      frame(0, false, true, 0.5, -0.375)
      frame(age * STEP, false)
      expect(frame(STEP, true)).toHaveLength(age === 5 ? 1 : 0)
    }
  })

  const scenarios = [
    ['generic', [[HIT, 0]], 0, HIT], ['pass', [[PASS, 0]], 0, PASS],
    ['tie', [[HIT, 0], [PASS, 0]], 0, PASS], ['hit first', [[HIT, 0], [PASS, 2]], 4, HIT],
    ['pass first', [[PASS, 0], [HIT, 2]], 4, PASS], ['promotion', [[HIT, 0], [PASS, 2]], 6, PASS],
  ] as const

  it.each(scenarios)('%s replays with identical observations, responses and state at 30/60/120 FPS, including reset', (_label, commands, entry, winner) => {
    function run(fps: number) {
      const sim = new FixedStepVolleyballSimulator(INITIAL)
      function session(second: boolean) {
        const actions: ActionStepObservation[] = []
        const events: BallSimulationEvent[] = []
        const sampled = new Set<number>()
        for (let frame = 0; frame < fps / 5; frame += 1) {
          const step = sim.totalSimulationSteps
          const scheduled = second ? [[PASS, 2] as const] : commands
          const intents = sampled.has(step) ? [] : scheduled.filter(([, at]) => at === step).map(([type]) => command(type, 'a', 0.375, -0.25))
          sampled.add(step)
          const result = sim.advanceWithActions(1 / fps, step >= (second ? 2 : entry) ? [target()] : [], intents)
          actions.push(...result.actionSteps)
          events.push(...result.events)
        }
        expect(sim.totalSimulationSteps).toBe(12)
        expect(responses(events).map(({ type }) => type)).toEqual([responseType(second ? PASS : winner)])
        expect(actions.find(({ executedAction }) => executedAction)?.executedAction?.responseStep).toBe(second ? 2 : entry)
        return { actions, events, state: sim.getState() }
      }
      const before = session(false)
      sim.reset(INITIAL)
      const after = session(true)
      expect(after.actions[0].selectedActions).toEqual([])
      return { before, after }
    }
    const reference = run(60)
    expect(run(30)).toEqual(reference)
    expect(run(120)).toEqual(reference)
  })
})
