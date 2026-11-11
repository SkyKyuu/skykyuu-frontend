import { describe, expect, it } from 'vitest'
import type { PlayerCommandIntent } from '@/game/actions/playerActionResolver'
import type { SpikeIntent } from '@/game/actions/spikeIntent'
import { FixedStepVolleyballSimulator } from '@/game/ball/FixedStepVolleyballSimulator'
import { VOLLEYBALL_CONFIG } from '@/game/ball/volleyballConfig'
import { VOLLEYBALL_SIMULATION_CONFIG } from '@/game/ball/volleyballSimulationConfig'
import { stepVolleyballFreeFlight } from '@/game/ball/volleyballSimulationMath'
import type { PlayerBallContactTarget } from '@/game/contact/playerBallContact'

const { fixedStepSeconds: STEP } = VOLLEYBALL_SIMULATION_CONFIG
const target: PlayerBallContactTarget = { playerId: 'a', teamSide: 'A', position: { x: 0, y: 0, z: -1 } }
const spike: SpikeIntent = {
  actionType: 'SPIKE', playerId: 'a', teamSide: 'A', spikePressed: true, aimLateral: 0, aimForward: 0,
}
const set: PlayerCommandIntent = {
  actionType: 'SET', playerId: 'a', setPressed: true, setHeld: true, aimLateral: 0, aimForward: 0,
}
const hit: PlayerCommandIntent = {
  actionType: 'GENERIC_HIT', playerId: 'a', hitPressed: true, hitHeld: true, aimLateral: 0, aimForward: 0,
}
const lowBall = { position: { x: 0, y: 1, z: -1 }, velocity: { x: 0, y: 0, z: 0 } }
const highBall = { position: { x: 0, y: 2.75, z: -1 }, velocity: { x: 0, y: 0, z: 0 } }
const aerialTarget = { ...target, grounded: false, position: { ...target.position, y: 0.85 } }

describe('SPIKE in the fixed-step simulator', () => {
  it.each([
    [true, 'GROUNDED'],
    [undefined, 'POSE_UNAVAILABLE'],
  ] as const)('records %s as %s and reselects the same player ahead of other targets', (grounded, reason) => {
    const sim = new FixedStepVolleyballSimulator(lowBall)
    const other: PlayerBallContactTarget = { ...target, playerId: 'b', teamSide: 'B', grounded: false }
    const { events, lastActionStep } = sim.advanceWithActions(STEP, [
      { ...target, grounded }, other,
    ], [set, spike, { ...spike, playerId: 'b', teamSide: 'B' }])
    expect(events.map(({ type }) => type)).toEqual(['PLAYER_CONTACT', 'PLAYER_CONTACT', 'PLAYER_SET_RESPONSE'])
    expect(lastActionStep.selectedActions.map(({ playerId, actionType }) => [playerId, actionType]))
      .toEqual([['a', 'SPIKE'], ['b', 'SPIKE']])
    expect(lastActionStep.executedAction?.action).toMatchObject({ playerId: 'a', actionType: 'SET' })
    expect(lastActionStep.rejectedActions).toEqual([
      { playerId: 'a', actionType: 'SPIKE', pressStep: 0, responseStep: 0, reason },
    ])
    expect(Object.isFrozen(lastActionStep.rejectedActions)).toBe(true)
    expect(Object.isFrozen(lastActionStep.rejectedActions?.[0])).toBe(true)
    expect(sim.advanceWithActions(0).lastActionStep.selectedActions)
      .toMatchObject([{ playerId: 'b', actionType: 'SPIKE', pressStep: 0 }])
  })

  it('continues to the next overlapping target in target order when no local candidate survives', () => {
    const sim = new FixedStepVolleyballSimulator(lowBall)
    const first = { ...target, playerId: 'z', grounded: true }
    const second = { ...target, playerId: 'b', grounded: true }
    const { events, lastActionStep } = sim.advanceWithActions(STEP, [first, second, target], [
      hit, { ...spike, playerId: 'z' }, { ...set, playerId: 'b' },
    ])
    expect(events.map(({ type }) => type)).toEqual([
      'PLAYER_CONTACT', 'PLAYER_CONTACT', 'PLAYER_CONTACT', 'PLAYER_SET_RESPONSE',
    ])
    expect(lastActionStep.rejectedActions).toMatchObject([{ playerId: 'z', reason: 'GROUNDED' }])
    expect(lastActionStep.executedAction?.action).toMatchObject({ playerId: 'b', actionType: 'SET' })
    expect(sim.advanceWithActions(0).lastActionStep.selectedActions)
      .toMatchObject([{ playerId: 'a', actionType: 'GENERIC_HIT' }])
  })

  it('does not mutate free flight or lock a rejected overlap, and uses entry timing when a later press executes', () => {
    const sim = new FixedStepVolleyballSimulator(lowBall)
    const rejected = sim.advanceWithActions(STEP, [{ ...target, grounded: true }], [spike])
    expect(rejected.events.map(({ type }) => type)).toEqual(['PLAYER_CONTACT'])
    expect(rejected.lastActionStep.executedAction).toBeNull()
    expect(sim.getState()).toEqual(stepVolleyballFreeFlight(lowBall, STEP))

    const after = sim.advanceWithActions(STEP, [{ ...target, grounded: false }])
    expect(after.events).toEqual([])
    expect(after.lastActionStep.selectedActions).toEqual([])
    expect(after.lastActionStep.rejectedActions).toBeUndefined()

    const response = sim.advanceWithActions(STEP, [{ ...target, grounded: false }], [spike])
    expect(response.events).toHaveLength(1)
    expect(response.events[0]).toMatchObject({
      type: 'PLAYER_SPIKE_RESPONSE', pressStep: 2, contactStep: 0, responseStep: 2,
      timingOffsetSteps: 2, timingGrade: 'LATE', trajectoryMode: 'BASELINE_B_FALLBACK',
      outgoingVelocity: sim.getState().velocity,
    })
    expect(response.lastActionStep.executedAction?.outgoingVelocity).toEqual(sim.getState().velocity)
    const locked = sim.advanceWithActions(STEP, [{ ...target, grounded: false }], [spike])
    expect(locked.events).toEqual([])
    expect(locked.lastActionStep.selectedActions).toEqual([])
  })

  it('commits an immutable Model C response once after the overlap event, preserving ball position', () => {
    const sim = new FixedStepVolleyballSimulator(highBall)
    const result = sim.advanceWithActions(STEP, [aerialTarget], [spike])
    expect(result.events.map(({ type }) => type)).toEqual(['PLAYER_CONTACT', 'PLAYER_SPIKE_RESPONSE'])
    const spikeEvent = result.events[1]
    expect(spikeEvent).toMatchObject({
      trajectoryMode: 'MODEL_C', timingGrade: 'PERFECT',
      pressStep: 0, contactStep: 0, responseStep: 0,
      outgoingVelocity: sim.getState().velocity,
      ballPosition: stepVolleyballFreeFlight(highBall, STEP).position,
    })
    expect(result.lastActionStep.executedAction?.outgoingVelocity).toEqual(sim.getState().velocity)
    expect(sim.getState().position).toEqual(stepVolleyballFreeFlight(highBall, STEP).position)
    expect(Object.isFrozen(spikeEvent)).toBe(true)
  })

  it('takes the ground route first, clears SPIKE, and permits the legacy route after reset', () => {
    const lowImpact = {
      position: { ...lowBall.position, y: VOLLEYBALL_CONFIG.radius + 0.001 },
      velocity: { x: 0, y: -1, z: 0 },
    }
    const sim = new FixedStepVolleyballSimulator(lowImpact)
    const grounded = sim.advanceWithActions(2 * STEP, [{ ...target, grounded: false }], [spike])
    expect(grounded.events.map(({ type }) => type)).toEqual(['PLAYER_CONTACT', 'GROUND_CONTACT'])
    expect(grounded.lastActionStep).toEqual({ simulationStep: 0, selectedActions: [], executedAction: null })
    expect(sim.advanceWithActions(STEP, [target], [spike]).executedSteps).toBe(0)
    sim.reset(lowBall)
    expect(sim.advanceWithActions(STEP, [target]).lastActionStep.selectedActions).toEqual([])
    sim.reset(lowBall)
    expect(sim.advance(STEP, [target], [{ playerId: 'a', hitHeld: true, hitPressed: true, aimLateral: 0, aimForward: 0 }])
      .events.map(({ type }) => type)).toEqual(['PLAYER_CONTACT', 'PLAYER_CONTACT_RESPONSE'])
  })

  it('allows one response per tick and unlocks a valid buffered SPIKE after exit and reentry', () => {
    const sim = new FixedStepVolleyballSimulator(lowBall)
    sim.advanceWithActions(STEP, [], [set])
    const pose = { ...target, grounded: false }
    const first = sim.advanceWithActions(STEP, [pose], [spike])
    expect(first.events.map(({ type }) => type)).toEqual(['PLAYER_CONTACT', 'PLAYER_SET_RESPONSE'])
    expect(sim.advanceWithActions(STEP, [pose]).events).toEqual([])
    expect(sim.advanceWithActions(STEP, []).events).toEqual([])
    const reentry = sim.advanceWithActions(STEP, [pose])
    expect(reentry.events.map(({ type }) => type)).toEqual(['PLAYER_CONTACT', 'PLAYER_SPIKE_RESPONSE'])
    expect(reentry.events[1]).toMatchObject({ pressStep: 1, contactStep: 4, responseStep: 4 })
  })

  it('replays isolated Model C, fallback, rejection, ground and reset at 30/60/120 FPS', () => {
    function replay(fps: number) {
      const sim = new FixedStepVolleyballSimulator(highBall)
      const simulateRally = (pose: PlayerBallContactTarget) => {
        const capture = sim.advanceWithActions(0, [pose], [spike]).lastActionStep
        const frames = Array.from({ length: fps }, () => sim.advanceWithActions(1 / fps, [pose]))
        return {
          capture, count: sim.totalSimulationSteps, state: sim.getState(),
          steps: frames.flatMap(({ actionSteps }) => actionSteps),
          events: frames.flatMap(({ events }) => events),
        }
      }
      const modelC = simulateRally(aerialTarget)
      sim.reset(lowBall)
      const fallback = simulateRally({ ...target, grounded: false })
      sim.reset(lowBall)
      const rejected = simulateRally({ ...target, grounded: true })
      return { modelC, fallback, rejected }
    }

    const replay60 = replay(60)
    expect(replay(30)).toEqual(replay60)
    expect(replay(120)).toEqual(replay60)
    expect(replay60.modelC.events.map(({ type }) => type)).toEqual([
      'PLAYER_CONTACT', 'PLAYER_SPIKE_RESPONSE', 'GROUND_CONTACT',
    ])
    expect(replay60.modelC.events[1]).toMatchObject({ trajectoryMode: 'MODEL_C' })
    expect(replay60.fallback.events[1]).toMatchObject({ trajectoryMode: 'BASELINE_B_FALLBACK' })
    expect(replay60.rejected.steps[0].rejectedActions).toMatchObject([{ reason: 'GROUNDED' }])
    expect(replay60.rejected.events.map(({ type }) => type)).toEqual(['PLAYER_CONTACT', 'GROUND_CONTACT'])
  })
})
