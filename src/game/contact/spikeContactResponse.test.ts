import { describe, expect, it } from 'vitest'
import { VOLLEYBALL_CONFIG } from '@/game/ball/volleyballConfig'
import { VOLLEYBALL_SIMULATION_CONFIG } from '@/game/ball/volleyballSimulationConfig'
import type { PlayerBallContactEvent } from '@/game/contact/playerBallContact'
import { solveSpikeBallisticCorridor } from '@/game/contact/spikeBallisticCorridor'
import { createSpikeContactResponse } from '@/game/contact/spikeContactResponse'
import { INDOOR_COURT } from '@/game/court/indoorCourtDimensions'
import { INDOOR_NET, INDOOR_NET_HEIGHTS } from '@/game/net/indoorNetDimensions'
import type { TeamSide } from '@/game/team/teamTypes'

const { gravity, fixedStepSeconds: STEP } = VOLLEYBALL_SIMULATION_CONFIG
const { radius } = VOLLEYBALL_CONFIG
const envelope = radius + INDOOR_NET.bandDepth / 2
const clearance = INDOOR_NET_HEIGHTS.men + radius
const opponentEnd = INDOOR_COURT.halfLength - radius
const tolerance = 1e-12
const grades = [
  ['VERY_EARLY', -5, 0.75, 0.60],
  ['EARLY', -2, 0.90, 0.85],
  ['PERFECT', 0, 1, 1],
  ['LATE', 2, 0.90, 0.85],
  ['VERY_LATE', 5, 0.75, 0.60],
] as const

function makeContact(teamSide: TeamSide, height: number, distance: number): PlayerBallContactEvent {
  const sign = teamSide === 'A' ? 1 : -1
  return {
    type: 'PLAYER_CONTACT',
    playerId: 'p',
    teamSide,
    ballPosition: { x: sign * 0.5, y: height, z: -sign * distance },
    ballVelocity: { x: sign * 2, y: 20, z: -sign * 30 },
    playerPosition: { x: 0, y: 0.85, z: -sign * distance },
  }
}

function flightHeight(height: number, vy: number, t: number): number {
  return height + vy * t - gravity * t * t / 2
}

function timeUntilGround(height: number, vy: number): number {
  // Solve the quadratic independently of the production solver's root formula.
  const delta = height - radius
  return (2 * delta) / (Math.hypot(vy, Math.sqrt(2 * gravity * delta)) - vy)
}

const matrix = (['A', 'B'] as const).flatMap((team) =>
  [0.5, 1, 1.5, 2, 3].flatMap((distance) =>
    [2.755, 2.6, 2.4].flatMap((height) => grades.flatMap(([grade, offset, power, accuracy]) =>
      [-1, 0, 1].map((forward) => ({ team, distance, height, grade, offset, power, accuracy, forward })),
    )),
  ),
)

describe('SPIKE geometry and horizontal invariants', () => {
  it.each(matrix)('$team, d=$distance m, h=$height m, $grade, aim=$forward', (sample) => {
    const { team, distance, height, grade, offset, power, accuracy, forward } = sample
    const contact = makeContact(team, height, distance)
    const s = team === 'A' ? 1 : -1
    const press = 10 + offset
    const spike = createSpikeContactResponse(contact, press, 10, Math.max(10, press), STEP, 0.75, forward)
    const { x, y, z } = spike.outgoingVelocity
    const q = 13.5 * power + 2 * (forward * accuracy)
    const tEntry = (distance - envelope) / q
    const tExit = (distance + envelope) / q
    const tEnd = (distance + opponentEnd) / q
    // The largest landing-compatible Vy maximizes clearance at both times.
    const endLimit = (radius - height + gravity * tEnd * tEnd / 2) / tEnd
    const corridorExists = [tEntry, tExit].every((t) => flightHeight(height, endLimit, t) >= clearance)

    expect([x, y, z].every(Number.isFinite)).toBe(true)
    expect(q).toBeGreaterThan(0)
    expect(x).toBe(s * 0.5 + s * 3.2 * (0.75 * accuracy))
    expect(z).toBe(s * q)
    expect(spike).toMatchObject({
      timingGrade: grade, timingPowerMultiplier: power, timingAccuracyMultiplier: accuracy,
      timingOffsetSteps: offset, timingOffsetSeconds: offset * STEP,
      effectiveAimLateral: 0.75 * accuracy, effectiveAimForward: forward * accuracy,
    })
    if (!corridorExists) {
      expect(spike).toMatchObject({
        trajectoryMode: 'BASELINE_B_FALLBACK', fallbackReason: 'NO_ADMISSIBLE_CORRIDOR',
        outgoingVelocity: { y: -2 * power },
      })
      expect(spike).not.toHaveProperty('corridor')
      return
    }

    expect(spike.trajectoryMode).toBe('MODEL_C')
    if (spike.trajectoryMode !== 'MODEL_C') return
    const { vMin, vMax, selectedVy } = spike.corridor
    const groundTime = timeUntilGround(height, y)
    expect(y).toBe(selectedVy)
    expect(y).toBe((vMin + vMax) / 2)
    expect(vMax).toBeCloseTo(endLimit, 12)
    expect(Math.min(...[tEntry, tExit].map((t) => flightHeight(height, vMin, t)))).toBeCloseTo(clearance, 12)
    expect(flightHeight(height, y, tEntry)).toBeGreaterThanOrEqual(clearance - tolerance)
    expect(flightHeight(height, y, tExit)).toBeGreaterThanOrEqual(clearance - tolerance)
    expect(groundTime).toBeGreaterThan(tExit)
    expect(groundTime).toBeLessThanOrEqual(tEnd + tolerance)
    expect(Object.isFrozen(spike.corridor)).toBe(true)
  })

  it.each([
    [0.5, -2.490, 6.571],
    [1, -1.136, 7.482],
    [1.5, -0.457, 7.814],
    [2, 0.021, 7.952],
    [3, 0.747, 8.004],
  ])('reproduces the neutral PERFECT reference at %s m, mirrored between teams', (distance, vy, landing) => {
    const a = createSpikeContactResponse(makeContact('A', 2.755, distance), 0, 0, 0, STEP, 0, 0)
    const b = createSpikeContactResponse(makeContact('B', 2.755, distance), 0, 0, 0, STEP, 0, 0)
    expect(a.trajectoryMode).toBe('MODEL_C')
    expect(b.trajectoryMode).toBe('MODEL_C')
    expect(a.outgoingVelocity.y).toBeCloseTo(vy, 3)
    expect(a.outgoingVelocity.z * timeUntilGround(2.755, a.outgoingVelocity.y) - distance)
      .toBeCloseTo(landing, 3)
    expect(b.outgoingVelocity).toEqual({ x: -a.outgoingVelocity.x, y: a.outgoingVelocity.y, z: -a.outgoingVelocity.z })
  })

  it.each(grades.flatMap((grade) => [-1, 0, 1].flatMap((forward) =>
    [-1, 0, 1].map((lateral) => ({ grade, forward, lateral })),
  )))('applies B for $grade.0 with lateral $lateral and forward $forward', ({ grade, forward, lateral }) => {
    const [, offset, power, accuracy] = grade
    const press = 10 + offset
    const contact = makeContact('A', 1.3368, 0.05)
    const event = createSpikeContactResponse(contact, press, 10, Math.max(10, press) + 1, STEP, lateral, forward)
    const changed = createSpikeContactResponse({
      ...contact, ballVelocity: { ...contact.ballVelocity, y: -100, z: 200 },
    }, press, 10, event.responseStep, STEP, lateral, forward)
    const mirror = createSpikeContactResponse(makeContact('B', 1.3368, 0.05), press, 10, event.responseStep, STEP, lateral, forward)

    expect(event).toMatchObject({
      trajectoryMode: 'BASELINE_B_FALLBACK', fallbackReason: 'NO_ADMISSIBLE_CORRIDOR',
      outgoingVelocity: { x: 0.5 + 3.2 * (lateral * accuracy), y: -2 * power, z: 13.5 * power + 2 * (forward * accuracy) },
    })
    expect(event.outgoingVelocity).toEqual(changed.outgoingVelocity)
    expect(mirror.outgoingVelocity).toEqual({
      x: -event.outgoingVelocity.x, y: event.outgoingVelocity.y, z: -event.outgoingVelocity.z,
    })
  })

  it.each([
    [NaN, 0.5, 13.5], [2.755, Infinity, 13.5], [2.755, 0.5, NaN],
    [2.755, -0.1, 13.5], [radius, 0.5, 13.5], [2.755, 0.5, 0],
    [2.755, 0.5, -13.5], [2.755, 0.5, Number.MIN_VALUE],
  ])('falls back safely on invalid geometry h=%s d=%s q=%s', (h, d, q) => {
    expect(solveSpikeBallisticCorridor(h, d, q)).toEqual({
      trajectoryMode: 'BASELINE_B_FALLBACK', fallbackReason: 'INVALID_GEOMETRY',
    })
  })

  it.each([0, envelope / 2, envelope])('handles tEntry=0 at distance %s', (distance) => {
    expect(solveSpikeBallisticCorridor(2.755, distance, 13.5).trajectoryMode).toBe('MODEL_C')
    expect(solveSpikeBallisticCorridor(clearance - 0.001, distance, 13.5)).toEqual({
      trajectoryMode: 'BASELINE_B_FALLBACK', fallbackReason: 'NO_ADMISSIBLE_CORRIDOR',
    })
    // Exact initial clearance can still fail the landing bound at this forward speed.
    expect(solveSpikeBallisticCorridor(clearance, distance, 13.5)).toMatchObject({
      trajectoryMode: 'BASELINE_B_FALLBACK', fallbackReason: 'NO_ADMISSIBLE_CORRIDOR',
    })
    expect(solveSpikeBallisticCorridor(clearance, distance, 8.925).trajectoryMode).toBe('MODEL_C')
  })

  it('builds immutable event telemetry with independent contact and response steps', () => {
    const contact = makeContact('A', 2.755, 1)
    const event = createSpikeContactResponse(contact, 4, 2, 5, STEP, -1, 1)
    expect(event).toMatchObject({
      type: 'PLAYER_SPIKE_RESPONSE', actionType: 'SPIKE', playerId: 'p', teamSide: 'A',
      pressStep: 4, contactStep: 2, responseStep: 5,
      aimLateral: -1, aimForward: 1, timingGrade: 'LATE', timingOffsetSteps: 2,
    })
    const snapshots = [event, event.ballPosition, event.incomingVelocity, event.outgoingVelocity]
    expect(snapshots.every(Object.isFrozen)).toBe(true)
    contact.ballPosition.y = 0
    contact.ballVelocity.x = 30
    expect(event.ballPosition.y).toBe(2.755)
    expect(event.incomingVelocity.x).toBe(2)
  })

  it('reports invalid contact geometry with a finite baseline velocity', () => {
    const event = createSpikeContactResponse(makeContact('A', Infinity, 1), 0, 0, 0, STEP, 0, 0)
    expect(event).toMatchObject({
      trajectoryMode: 'BASELINE_B_FALLBACK', fallbackReason: 'INVALID_GEOMETRY',
      outgoingVelocity: { x: 0.5, y: -2, z: 13.5 },
    })
  })

  it.each([NaN, Infinity, -Infinity, -1.01, 1.01])('rejects invalid aim %s on either axis', (aim) => {
    const contact = makeContact('A', 2.755, 1)
    expect(() => createSpikeContactResponse(contact, 0, 0, 0, STEP, aim, 0)).toThrow(RangeError)
    expect(() => createSpikeContactResponse(contact, 0, 0, 0, STEP, 0, aim)).toThrow(RangeError)
  })
})
