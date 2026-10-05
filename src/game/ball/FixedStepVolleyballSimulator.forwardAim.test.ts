import { describe, expect, it } from 'vitest'
import { FixedStepVolleyballSimulator } from '@/game/ball/FixedStepVolleyballSimulator'
import type { BallSimulationAdvanceResult } from '@/game/ball/FixedStepVolleyballSimulator'
import { VOLLEYBALL_SIMULATION_CONFIG } from '@/game/ball/volleyballSimulationConfig'
import { VOLLEYBALL_CONFIG } from '@/game/ball/volleyballConfig'
import type { PlayerHitIntent } from '@/game/contact/playerHitIntent'
import type { PlayerBallContactTarget } from '@/game/contact/playerBallContact'
import type { TeamSide } from '@/game/team/teamTypes'

const STEP = VOLLEYBALL_SIMULATION_CONFIG.fixedStepSeconds
const INITIAL = {
  position: { x: 0, y: 1, z: 0 },
  velocity: { x: 0.25, y: 0, z: 0 },
}

function target(playerId = 'player', teamSide: TeamSide = 'A', far = false): PlayerBallContactTarget {
  return { playerId, teamSide, position: { x: far ? 10 : 0, y: 0, z: 0 } }
}

function intent(aimForward: number, playerId = 'player', hitPressed = true): PlayerHitIntent {
  return { playerId, hitHeld: true, hitPressed, aimLateral: 0.375, aimForward }
}

function response(result: BallSimulationAdvanceResult) {
  const event = result.events.find((event) => event.type === 'PLAYER_CONTACT_RESPONSE')
  if (!event || event.type !== 'PLAYER_CONTACT_RESPONSE') throw new Error('Missing response')
  return event
}

function expectNoResponse(result: BallSimulationAdvanceResult) {
  expect(result.events.some((event) => event.type === 'PLAYER_CONTACT_RESPONSE')).toBe(false)
}

function pendingForward(simulator: FixedStepVolleyballSimulator) {
  return (simulator as unknown as { hitAimForwardByPlayer: Map<string, number> }).hitAimForwardByPlayer
}

describe('forward hit aim intent buffer', () => {
  const localCases = (['A', 'B'] as const).flatMap((team) =>
    [-1, 0, 1, -Math.SQRT1_2, Math.SQRT1_2, 0.5].map((forward) => [team, forward] as const),
  )

  it.each(localCases)('Team %s preserves local forward %s on response without physics', (team, forward) => {
    const simulator = new FixedStepVolleyballSimulator(INITIAL)
    const event = response(simulator.advance(STEP, [target('player', team)], [intent(forward)]))
    const neutral = new FixedStepVolleyballSimulator(INITIAL)
    const neutralEvent = response(neutral.advance(STEP, [target('player', team)], [intent(0)]))
    expect(event.hitAimForward).toBe(forward)
    expect({
      ...event, hitAimForward: 0,
      hitEffectiveAimForward: 0, hitEffectiveAimWorldZ: 0,
    }).toEqual(neutralEvent)
    expect(simulator.getState()).toEqual(neutral.getState())
    expect(pendingForward(simulator).size).toBe(0)
    expect(event).not.toHaveProperty('hitAimWorldZ')
    expect(event.hitEffectiveAimForward).toBe(forward)
    expect(event).not.toHaveProperty('hitAimVelocityZ')
  })

  it('latches at press, ignores later movement, and leaves raw forward unscaled by EARLY accuracy', () => {
    const simulator = new FixedStepVolleyballSimulator(INITIAL)
    const pressed = intent(1)
    simulator.advance(STEP, [target('player', 'B', true)], [pressed])
    pressed.aimForward = -1
    const event = response(simulator.advance(STEP, [target('player', 'B')], [intent(-1, 'player', false)]))
    expect(event.hitAimForward).toBe(1)
    expect(event.hitTimingGrade).toBe('EARLY')
    expect(event.hitTimingAccuracyMultiplier).toBe(0.85)
    expect(event.outgoingVelocity.z).toBe(-4.5)
  })

  it('zero-step press preserves the value until the next simulation step', () => {
    const simulator = new FixedStepVolleyballSimulator(INITIAL)
    expect(simulator.advance(0, [], [intent(Math.SQRT1_2)]).executedSteps).toBe(0)
    expect(response(simulator.advance(STEP, [target()], [intent(-1, 'player', false)])).hitAimForward).toBe(Math.SQRT1_2)
  })

  it('a legitimate re-press replaces forward and timing together', () => {
    const simulator = new FixedStepVolleyballSimulator(INITIAL)
    simulator.advance(STEP, [target('player', 'A', true)], [intent(1)])
    simulator.advance(0, [], [intent(-1)])
    const event = response(simulator.advance(STEP, [target()]))
    expect(event.hitAimForward).toBe(-1)
    expect(event.hitTimingOffsetSteps).toBe(0)
  })

  it('expiration removes forward and only a new press can arm it again', () => {
    const simulator = new FixedStepVolleyballSimulator(INITIAL)
    simulator.advance(0, [], [intent(1)])
    for (let step = 0; step < 6; step++) simulator.advance(STEP)
    expect(pendingForward(simulator).size).toBe(0)
    expectNoResponse(simulator.advance(STEP, [target()]))
    expect(response(simulator.advance(STEP, [target()], [intent(-0.5)])).hitAimForward).toBe(-0.5)
  })

  it('reset clears forward and no stale response survives', () => {
    const simulator = new FixedStepVolleyballSimulator(INITIAL)
    simulator.advance(0, [], [intent(1)])
    simulator.reset(INITIAL)
    expect(pendingForward(simulator).size).toBe(0)
    expectNoResponse(simulator.advance(STEP, [target()]))
    expect(response(simulator.advance(STEP, [target()], [intent(0)])).hitAimForward).toBe(0)
  })

  it.each([0, STEP])('same-overlap protection discards a new press at delta %s', (delta) => {
    const simulator = new FixedStepVolleyballSimulator(INITIAL)
    simulator.advance(STEP, [target()], [intent(1)])
    expectNoResponse(simulator.advance(delta, [target()], [intent(-1)]))
    expect(pendingForward(simulator).size).toBe(0)
    simulator.advance(STEP, [target('player', 'A', true)])
    expectNoResponse(simulator.advance(STEP, [target()]))
    expect(response(simulator.advance(STEP, [target()], [intent(0.5)])).hitAimForward).toBe(0.5)
  })

  it('ground impact clears forward and remains terminal', () => {
    const simulator = new FixedStepVolleyballSimulator({
      position: { x: 0, y: VOLLEYBALL_CONFIG.radius + 0.01, z: 0 },
      velocity: { x: 0, y: -1, z: 0 },
    })
    simulator.advance(0, [], [intent(1)])
    const impact = simulator.advance(STEP, [target()])
    expect(impact.events.some((event) => event.type === 'GROUND_CONTACT')).toBe(true)
    expectNoResponse(impact)
    expect(pendingForward(simulator).size).toBe(0)
    expectNoResponse(simulator.advance(STEP, [target()], [intent(-1)]))
    expect(pendingForward(simulator).size).toBe(0)
  })

  it('isolates pending forward snapshots for multiple players', () => {
    const simulator = new FixedStepVolleyballSimulator(INITIAL)
    simulator.advance(0, [], [intent(1, 'a'), intent(-0.5, 'b')])
    const targets = [target('a', 'A'), target('b', 'B')]
    expect(response(simulator.advance(STEP, targets)).hitAimForward).toBe(1)
    expect(pendingForward(simulator).get('b')).toBe(-0.5)
    const second = response(simulator.advance(STEP, targets))
    expect(second.playerId).toBe('b')
    expect(second.hitAimForward).toBe(-0.5)
    expect(pendingForward(simulator).size).toBe(0)
  })

  it.each([-1.01, 1.01, NaN, Infinity, -Infinity])('rejects invalid pressed forward %s without replacing a valid buffer', (forward) => {
    const simulator = new FixedStepVolleyballSimulator(INITIAL)
    simulator.advance(0, [], [intent(1)])
    expect(() => simulator.advance(0, [], [intent(forward)])).toThrow(RangeError)
    expect(response(simulator.advance(STEP, [target()])).hitAimForward).toBe(1)
  })

  it('ignores forward values when there is no new hit press', () => {
    const simulator = new FixedStepVolleyballSimulator(INITIAL)
    expect(() => simulator.advance(0, [], [intent(NaN, 'player', false)])).not.toThrow()
    expect(pendingForward(simulator).size).toBe(0)
  })

  it('repeated buffered sequences produce identical events and states', () => {
    function run() {
      const simulator = new FixedStepVolleyballSimulator(INITIAL)
      simulator.advance(STEP, [], [intent(Math.SQRT1_2)])
      return { result: simulator.advance(STEP, [target()]), state: simulator.getState() }
    }
    expect(run()).toEqual(run())
  })
})
