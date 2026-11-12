import { describe, expect, it } from 'vitest'
import type { PlayerCommandIntent, ResolvableActionType } from '@/game/actions/playerActionResolver'
import type { BallSimulationEvent } from '@/game/ball/ballGroundContact'
import { FixedStepVolleyballSimulator, type ActionStepObservation } from '@/game/ball/FixedStepVolleyballSimulator'
import { VOLLEYBALL_CONFIG } from '@/game/ball/volleyballConfig'
import { VOLLEYBALL_SIMULATION_CONFIG } from '@/game/ball/volleyballSimulationConfig'
import type { TeamSide } from '@/game/team/teamTypes'

const STEP = VOLLEYBALL_SIMULATION_CONFIG.fixedStepSeconds
const INITIAL = { position: { x: 0, y: 1, z: 0 }, velocity: { x: 0.4, y: 0, z: 0 } }
const HIT = 'GENERIC_HIT'
const PASS = 'FOREARM_PASS'
const SET = 'SET'

const target = (playerId = 'a', teamSide: TeamSide = 'A', x = 0, z = 0) => ({
  playerId, teamSide, position: { x, y: 0, z },
})

function command(actionType: Exclude<ResolvableActionType, 'SPIKE'>, playerId = 'a', aimLateral = 0, aimForward = 0): PlayerCommandIntent {
  const aim = { playerId, aimLateral, aimForward }
  switch (actionType) {
    case HIT: return { ...aim, actionType, hitHeld: true, hitPressed: true }
    case PASS: return { ...aim, actionType, forearmPassHeld: true, forearmPassPressed: true }
    case SET: return { ...aim, actionType, setHeld: true, setPressed: true }
  }
}

function responses(events: readonly BallSimulationEvent[]) {
  return events.filter((event) => event.type === 'PLAYER_CONTACT_RESPONSE'
    || event.type === 'PLAYER_FOREARM_PASS_RESPONSE' || event.type === 'PLAYER_SET_RESPONSE')
}

function nearby(sim: FixedStepVolleyballSimulator) {
  const { x, z } = sim.getState().position
  return target('a', 'A', x, z)
}

describe('set gameplay in the fixed-step simulator', () => {
  it.each([
    [[SET], []],
    [[SET, HIT], [HIT]],
    [[PASS, SET], [PASS]],
    [[HIT, PASS, SET], [PASS]],
  ] as const)(
    'executes only SET from same-step inputs %j',
    (types, remaining) => {
      const sim = new FixedStepVolleyballSimulator(INITIAL)
      const result = sim.advanceWithActions(STEP, [target()], types.map((type) => command(type)))
      expect(result.events.map(({ type }) => type)).toEqual(['PLAYER_CONTACT', 'PLAYER_SET_RESPONSE'])
      const [event] = responses(result.events)
      expect(event.outgoingVelocity).toEqual({ x: 0.1, y: 7, z: 0.8 })
      expect(event.outgoingVelocity).toEqual(sim.getState().velocity)
      expect(event.ballPosition).toEqual(sim.getState().position)
      expect(event.ballPosition).toEqual(result.events[0].type === 'PLAYER_CONTACT' && result.events[0].ballPosition)
      expect(result.lastActionStep.executedAction).toMatchObject({
        action: { actionType: SET, pressStep: 0 }, responseStep: 0, timingGrade: 'PERFECT',
        outgoingVelocity: event.outgoingVelocity,
      })
      const next = sim.advanceWithActions(0)
      expect(next.lastActionStep.selectedActions.map(({ actionType }) => actionType)).toEqual(remaining)
    },
  )

  it.each([[HIT, SET], [SET, HIT], [PASS, SET], [SET, PASS]] as const)(
    'keeps %s ahead of a later %s through contact', (earlier, later) => {
      const sim = new FixedStepVolleyballSimulator(INITIAL)
      sim.advanceWithActions(2 * STEP, [], [command(earlier)])
      const result = sim.advanceWithActions(STEP, [target()], [command(later)])
      expect(responses(result.events)).toHaveLength(1)
      expect(result.lastActionStep.executedAction).toMatchObject({
        action: { actionType: earlier, pressStep: 0 }, responseStep: 2, timingGrade: 'EARLY',
      })
      expect(sim.advanceWithActions(0).lastActionStep.selectedActions[0]).toMatchObject({ actionType: later, pressStep: 2 })
    },
  )

  it('promotes all three candidates in the same frame and responds only on actual overlap', () => {
    // With 6 m/s toward the target, the first overlap is at step 8.
    const sim = new FixedStepVolleyballSimulator({
      position: { x: 0, y: 1, z: -1.23 }, velocity: { x: 0, y: 0, z: 6 },
    })
    sim.advanceWithActions(2 * STEP, [], [command(HIT)])
    sim.advanceWithActions(2 * STEP, [], [command(PASS)])
    const result = sim.advanceWithActions(5 * STEP, [target()], [command(SET, 'a', 0.5, -0.25)])
    expect(result.actionSteps.map(({ selectedActions }) => selectedActions[0]?.actionType)).toEqual([HIT, HIT, PASS, PASS, SET])
    expect(result.actionSteps.slice(0, -1).every(({ executedAction }) => executedAction === null)).toBe(true)
    expect(result.lastActionStep.executedAction).toMatchObject({ action: { actionType: SET, pressStep: 4 }, responseStep: 8 })
    expect(responses(result.events)).toEqual([
      expect.objectContaining({ type: 'PLAYER_SET_RESPONSE', pressStep: 4, contactStep: 8, timingGrade: 'VERY_EARLY' }),
    ])
  })

  it.each(['A', 'B'] as const)('uses Team %s and entry timing when a SET press arrives after contact', (teamSide) => {
    const sim = new FixedStepVolleyballSimulator(INITIAL)
    const targets = [target('a', teamSide)]
    expect(sim.advanceWithActions(2 * STEP, targets).events.map(({ type }) => type)).toEqual(['PLAYER_CONTACT'])
    const result = sim.advanceWithActions(STEP, targets, [command(SET, 'a', 1, 1)])
    expect(result.events).toHaveLength(1)
    const [event] = responses(result.events)
    expect(event).toMatchObject({ type: 'PLAYER_SET_RESPONSE', pressStep: 2, contactStep: 0, timingGrade: 'LATE', teamSide })
    expect(event.outgoingVelocity.x).toBeCloseTo(teamSide === 'A' ? 1.46 : -1.26, 12)
    expect(event.outgoingVelocity.z).toBeCloseTo(teamSide === 'A' ? 1.74 : -1.74, 12)
    expect(event.outgoingVelocity).toEqual(sim.getState().velocity)
  })

  it.each([5, 6])('captures SET in zero-step frames and checks expiry at age %s', (age) => {
    const sim = new FixedStepVolleyballSimulator(INITIAL)
    const result = sim.advanceWithActions(0, [target()], [command(SET)])
    expect(result).toMatchObject({ executedSteps: 0, events: [], actionSteps: [] })
    expect(result.lastActionStep.selectedActions[0]).toMatchObject({ actionType: SET, pressStep: 0 })
    for (let frame = 0; frame < 10; frame += 1) {
      expect(sim.advanceWithActions(0).lastActionStep).toEqual(result.lastActionStep)
    }
    sim.advanceWithActions(age * STEP)
    expect(responses(sim.advanceWithActions(STEP, [target()]).events)).toHaveLength(age === 5 ? 1 : 0)
  })

  it('re-presses SET with new aim and a new timing reference', () => {
    const sim = new FixedStepVolleyballSimulator(INITIAL)
    const original = sim.advanceWithActions(2 * STEP, [], [command(SET, 'a', 1, 1)])
    const latest = sim.advanceWithActions(0, [], [command(SET, 'a', -0.5, -0.25)]).lastActionStep.selectedActions[0]
    expect(latest).not.toBe(original.lastActionStep.selectedActions[0])
    const result = sim.advanceWithActions(STEP, [target()])
    expect(result.lastActionStep.executedAction?.action).toBe(latest)
    expect(responses(result.events)[0]).toMatchObject({
      pressStep: 2, contactStep: 2, timingGrade: 'PERFECT', aimLateral: -0.5, aimForward: -0.25,
    })
    expect(sim.advanceWithActions(0).lastActionStep.selectedActions).toEqual([])
  })

  it.each([NaN, Infinity, -Infinity, 1.1, -1.1])('rejects invalid SET batch aim %s before replacing candidates', (invalid) => {
    const sim = new FixedStepVolleyballSimulator(INITIAL)
    const old = sim.advanceWithActions(0, [], [command(HIT), command(SET)]).lastActionStep
    expect(() => sim.advanceWithActions(STEP, [target()], [command(SET, 'a', 0.5, 0.25), command(SET, 'a', invalid, 0)])).toThrow(RangeError)
    expect(() => sim.advanceWithActions(STEP, [target()], [command(PASS), command(SET, 'a', 0, invalid)])).toThrow(RangeError)
    expect(sim.advanceWithActions(0).lastActionStep).toEqual(old)
    expect(sim.totalSimulationSteps).toBe(0)
    expect(sim.getState()).toEqual(INITIAL)
  })

  it('locks the remaining candidates during continuous overlap and allows reentry', () => {
    const sim = new FixedStepVolleyballSimulator(INITIAL)
    sim.advanceWithActions(STEP, [target()], [command(HIT), command(PASS), command(SET)])
    const repeat = sim.advanceWithActions(STEP, [nearby(sim)], [command(SET), command(PASS, 'a', 1, 1)])
    expect(repeat.events).toEqual([])
    expect(repeat.lastActionStep.selectedActions[0]).toMatchObject({ actionType: PASS, pressStep: 0, aimLateral: 0 })
    expect(repeat.lastActionStep.executedAction).toBeNull()
    sim.advanceWithActions(STEP)
    const reentry = sim.advanceWithActions(STEP, [nearby(sim)])
    expect(reentry.events.map(({ type }) => type)).toEqual(['PLAYER_CONTACT', 'PLAYER_FOREARM_PASS_RESPONSE'])
    expect(sim.advanceWithActions(0).lastActionStep.selectedActions[0]).toMatchObject({ actionType: HIT, pressStep: 0 })
  })

  it('preserves target order and isolates each player and team', () => {
    const sim = new FixedStepVolleyballSimulator(INITIAL)
    const result = sim.advanceWithActions(2 * STEP, [target('b', 'B'), target()], [command(HIT), command(SET, 'b')])
    expect(responses(result.events).map((event) => [event.type, event.playerId, event.teamSide])).toEqual([
      ['PLAYER_SET_RESPONSE', 'b', 'B'], ['PLAYER_CONTACT_RESPONSE', 'a', 'A'],
    ])
    expect(result.actionSteps.map(({ executedAction }) => executedAction?.action.playerId)).toEqual(['b', 'a'])
    expect(sim.advanceWithActions(0).lastActionStep.selectedActions).toEqual([])
  })

  it('clears all actions on ground and clears contact and mode on reset', () => {
    const sim = new FixedStepVolleyballSimulator({
      position: { x: 0, y: VOLLEYBALL_CONFIG.radius + 0.001, z: 0 }, velocity: { x: 0, y: -1, z: 0 },
    })
    const ground = sim.advanceWithActions(3 * STEP, [target()], [command(HIT), command(PASS), command(SET)])
    expect(ground.events.map(({ type }) => type)).toEqual(['PLAYER_CONTACT', 'GROUND_CONTACT'])
    expect(ground.lastActionStep).toEqual({ simulationStep: 0, selectedActions: [], executedAction: null })
    expect(sim.advanceWithActions(STEP, [target()], [command(SET)]).executedSteps).toBe(0)
    sim.reset(INITIAL)
    expect(sim.totalSimulationSteps).toBe(0)
    expect(sim.advance(STEP, [target()]).events.map(({ type }) => type)).toEqual(['PLAYER_CONTACT'])
    sim.reset(INITIAL)
    const next = sim.advanceWithActions(STEP, [target()])
    expect(next.events.map(({ type }) => type)).toEqual(['PLAYER_CONTACT'])
    expect(next.lastActionStep.selectedActions).toEqual([])
    expect(sim.advanceWithActions(STEP, [target()], [command(SET)]).lastActionStep.executedAction?.timingGrade).toBe('LATE')
  })
})

type Scheduled = readonly [step: number, type: Exclude<ResolvableActionType, 'SPIKE'>, player?: string, lateral?: number]
const cases: readonly (readonly [name: string, entry: number, scheduled: readonly Scheduled[], expected: readonly ResolvableActionType[]])[] = [
  ['set', 0, [[0, SET]], [SET]],
  ['E + R', 0, [[0, HIT], [0, SET]], [SET]],
  ['Q + R', 0, [[0, PASS], [0, SET]], [SET]],
  ['E + Q + R', 0, [[0, HIT], [0, PASS], [0, SET]], [SET]],
  ['promotion', 8, [[0, HIT], [2, PASS], [4, SET]], [SET]],
  ['re-press', 4, [[0, SET, 'a', 1], [2, SET, 'a', -0.5]], [SET]],
  ['multiplayer', 0, [[0, HIT], [0, SET, 'b']], [SET, HIT]],
]

describe('set determinism across render rates', () => {
  it.each(cases)('replays %s at 30/60/120 FPS with equivalent observations, events and state after reset', (name, entry, scheduled, expected) => {
    function replay(fps: number) {
      const sim = new FixedStepVolleyballSimulator(INITIAL)
      function session(commands: readonly Scheduled[], contactStep: number, winners: readonly ResolvableActionType[]) {
        const actionSteps: ActionStepObservation[] = []
        const events: BallSimulationEvent[] = []
        const sampled = new Set<number>()
        for (let frame = 0; frame < fps / 5; frame += 1) {
          const step = sim.totalSimulationSteps
          const intents = sampled.has(step) ? [] : commands.filter(([at]) => at === step)
            .map(([, type, id, lateral]) => command(type, id, lateral ?? 0.375, -0.25))
          sampled.add(step)
          const targets = name === 'multiplayer' ? [target('b', 'B'), target()] : [target()]
          const result = sim.advanceWithActions(1 / fps, step >= contactStep ? targets : [], intents)
          actionSteps.push(...result.actionSteps)
          events.push(...result.events)
        }
        expect(sim.totalSimulationSteps).toBe(12)
        const executions = actionSteps.flatMap(({ executedAction }) => executedAction ? [executedAction] : [])
        expect(executions.map(({ action }) => action.actionType)).toEqual(winners)
        expect(executions.map(({ responseStep }) => responseStep)).toEqual(winners.map((_, index) => contactStep + index))
        return { actionSteps, events, state: sim.getState() }
      }
      const before = session(scheduled, entry, expected)
      sim.reset(INITIAL)
      const after = session([[2, SET]], 2, [SET])
      expect(after.actionSteps[0].selectedActions).toEqual([])
      return { before, after }
    }
    const reference = replay(60)
    expect(replay(30)).toEqual(reference)
    expect(replay(120)).toEqual(reference)
  })
})
