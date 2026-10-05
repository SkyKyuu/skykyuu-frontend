import { describe, expect, it } from 'vitest'
import { FixedStepVolleyballSimulator } from '@/game/ball/FixedStepVolleyballSimulator'
import { VOLLEYBALL_SIMULATION_CONFIG } from '@/game/ball/volleyballSimulationConfig'
import type { PlayerBallContactTarget } from '@/game/contact/playerBallContact'
import type { PlayerHitIntent } from '@/game/contact/playerHitIntent'
import type { TeamSide } from '@/game/team/teamTypes'

const STEP = VOLLEYBALL_SIMULATION_CONFIG.fixedStepSeconds
const TIMING_CASES = [
  [-4, 'VERY_EARLY', 0.60, 0.75],
  [-1, 'EARLY', 0.85, 0.90],
  [0, 'PERFECT', 1.00, 1.00],
  [1, 'LATE', 0.85, 0.90],
  [4, 'VERY_LATE', 0.60, 0.75],
] as const

function run(teamSide: TeamSide, offset: number, aimForward: number) {
  const simulator = new FixedStepVolleyballSimulator({
    position: { x: 0, y: 1, z: 0 },
    velocity: { x: 0.25, y: 0, z: 0 },
  })
  const target: PlayerBallContactTarget = {
    playerId: 'player', teamSide, position: { x: 0, y: 0, z: 0 },
  }
  const intent: PlayerHitIntent = {
    playerId: 'player', hitHeld: true, hitPressed: true, aimLateral: 0.375, aimForward,
  }

  if (offset < 0) {
    simulator.advance(STEP, [], [intent])
    for (let step = 1; step < -offset; step++) simulator.advance(STEP)
  } else {
    for (let step = 0; step < offset; step++) simulator.advance(STEP, [target])
  }
  const result = simulator.advance(STEP, [target], offset < 0
    ? [{ ...intent, hitPressed: false, aimForward: -aimForward }]
    : [intent])
  const event = result.events.find((event) => event.type === 'PLAYER_CONTACT_RESPONSE')
  if (!event || event.type !== 'PLAYER_CONTACT_RESPONSE') throw new Error('Missing response')
  const responseState = simulator.getState()
  simulator.advance(STEP)
  return { event, result, responseState, nextState: simulator.getState() }
}

describe('timing accuracy forward fidelity telemetry', () => {
  const cases = TIMING_CASES.flatMap(([offset, grade, accuracy, power]) =>
    (['A', 'B'] as const).flatMap((team) =>
      [-1, 0, 1, 0.5, -Math.SQRT1_2, Math.SQRT1_2].map((raw) =>
        [team, offset, grade, accuracy, power, raw] as const),
    ),
  )

  it.each(cases)('Team %s offset %s (%s), accuracy %s, power %s, raw %s', (team, offset, grade, accuracy, power, raw) => {
    const actual = run(team, offset, raw)
    const neutral = run(team, offset, 0)
    const { event } = actual
    expect(event.hitTimingOffsetSteps).toBe(offset)
    expect(event.hitTimingGrade).toBe(grade)
    expect(event.hitTimingAccuracyMultiplier).toBe(accuracy)
    expect(event.hitTimingForwardMultiplier).toBe(power)
    expect(event.hitAimForward).toBe(raw)
    expect(event.hitEffectiveAimForward).toBe(raw * accuracy)
    const expectedWorldZ = raw === 0 ? 0 : (team === 'A' ? raw * accuracy : -(raw * accuracy))
    expect(event.hitEffectiveAimWorldZ).toBe(expectedWorldZ)
    expect({ ...event, hitAimForward: 0, hitEffectiveAimForward: 0, hitEffectiveAimWorldZ: 0 }).toEqual(neutral.event)
    expect(event.outgoingVelocity).toEqual(neutral.event.outgoingVelocity)
    expect(event.outgoingVelocity.z).toBe(team === 'A' ? 5.0 * power : -5.0 * power)
    expect(actual.responseState).toEqual(neutral.responseState)
    expect(actual.nextState).toEqual(neutral.nextState)
    expect(event).not.toHaveProperty('hitAimVelocityZ')
    expect(actual).toEqual(run(team, offset, raw))
  })

  it.each([
    [1, 0.85, -0.85],
    [-1, -0.85, 0.85],
  ] as const)('Team B EARLY raw %s produces effective %s and world Z %s', (raw, effective, worldZ) => {
    expect(run('B', -1, raw).event).toMatchObject({
      hitAimForward: raw, hitEffectiveAimForward: effective, hitEffectiveAimWorldZ: worldZ,
    })
  })
})
