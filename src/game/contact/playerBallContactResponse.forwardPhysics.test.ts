import { describe, expect, it } from 'vitest'
import {
  applyPlayerContactResponse,
  getPlayerContactResponseVelocity,
} from '@/game/contact/playerBallContactResponse'
import type { PlayerBallContactEvent } from '@/game/contact/playerBallContact'

const TIMING_CASES = [
  ['VERY_EARLY', 0.75, 0.60, [2.55, 3.75, 4.95]],
  ['EARLY', 0.90, 0.85, [2.80, 4.50, 6.20]],
  ['PERFECT', 1.00, 1.00, [3.00, 5.00, 7.00]],
  ['LATE', 0.90, 0.85, [2.80, 4.50, 6.20]],
  ['VERY_LATE', 0.75, 0.60, [2.55, 3.75, 4.95]],
] as const

describe('deterministic forward hit aim response physics', () => {
  const canonicalCases = TIMING_CASES.flatMap(([grade, power, accuracy, velocities]) =>
    (['A', 'B'] as const).flatMap((team) =>
      ([-1, 0, 1] as const).map((forward, index) =>
        [team, grade, power, accuracy, forward, velocities[index]] as const),
    ),
  )

  it.each(canonicalCases)(
    'Team %s %s (power %s, accuracy %s), forward %s has canonical speed %s independent of incoming Vz',
    (team, grade, _power, accuracy, forward, speed) => {
      for (const incomingZ of [-100, 0, 100]) {
        const incoming = { x: 0.25, y: -2, z: incomingZ }
        const original = { ...incoming }
        const outgoing = getPlayerContactResponseVelocity(incoming, team, grade, 0.375, accuracy, forward)
        const neutral = getPlayerContactResponseVelocity(incoming, team, grade, 0.375, accuracy)
        expect(outgoing.z).toBeCloseTo(team === 'A' ? speed : -speed, 12)
        expect(outgoing.x).toBe(neutral.x)
        expect(outgoing.y).toBe(6.3)
        expect(incoming).toEqual(original)
      }
    },
  )

  it.each(TIMING_CASES)('preserves exact F2.17 neutral behavior for %s', (grade, power, accuracy) => {
    const incoming = { x: 0.25, y: -2, z: 100 }
    for (const team of ['A', 'B'] as const) {
      const sign = team === 'A' ? 1 : -1
      const legacy = getPlayerContactResponseVelocity(incoming, team, grade, 0.375, accuracy)
      expect(legacy).toEqual({
        x: incoming.x + sign * (0.375 * accuracy) * 3,
        y: 6.3,
        z: sign * (5 * power),
      })
      expect(getPlayerContactResponseVelocity(incoming, team, grade, 0.375, accuracy, 0)).toEqual(legacy)
      expect(getPlayerContactResponseVelocity(incoming, team, grade, 0.375, accuracy, -0)).toEqual(legacy)
    }
  })

  it.each(TIMING_CASES)('keeps team direction and symmetry at both forward extremes for %s', (grade, _power, accuracy) => {
    for (const forward of [-1, 1]) {
      const incoming = { x: 0.25, y: -2, z: -100 }
      const teamA = getPlayerContactResponseVelocity(incoming, 'A', grade, 0, accuracy, forward)
      const teamB = getPlayerContactResponseVelocity(incoming, 'B', grade, 0, accuracy, forward)
      expect(teamA.z).toBeGreaterThan(0)
      expect(teamB.z).toBeLessThan(0)
      expect(teamB.z).toBe(-teamA.z)
    }
  })

  it.each([
    ['A', Math.SQRT1_2, 5 + Math.SQRT1_2 * 2],
    ['A', -Math.SQRT1_2, 5 - Math.SQRT1_2 * 2],
    ['B', Math.SQRT1_2, -(5 + Math.SQRT1_2 * 2)],
    ['B', -Math.SQRT1_2, -(5 - Math.SQRT1_2 * 2)],
  ] as const)('preserves Team %s analog forward %s at outgoing Vz %s', (team, forward, outgoingZ) => {
    expect(getPlayerContactResponseVelocity(
      { x: 0.25, y: -2, z: 100 }, team, 'PERFECT', 0, 1, forward,
    )).toEqual({ x: 0.25, y: 6.3, z: outgoingZ })
  })

  it.each([
    ['A', 3.25, 7],
    ['B', -2.75, -7],
  ] as const)('composes both aim axes independently for Team %s', (team, x, z) => {
    expect(getPlayerContactResponseVelocity(
      { x: 0.25, y: -2, z: -100 }, team, 'PERFECT', 1, 1, 1,
    )).toEqual({ x, y: 6.3, z })
  })

  it('applies supplied accuracy once to aim while timing power only scales the base', () => {
    const incoming = { x: 0.25, y: -2, z: 100 }
    expect(getPlayerContactResponseVelocity(incoming, 'A', 'EARLY', 0, 0.85, 1).z).toBe(4.5 + 1.7)
    expect(getPlayerContactResponseVelocity(incoming, 'A', 'EARLY', 0, 1, 1).z).toBe(4.5 + 2)
    expect(getPlayerContactResponseVelocity(incoming, 'A', 'PERFECT', 0, 0.85, 1).z).toBe(5 + 1.7)
  })

  it('applies forward physics without mutating the state or contact', () => {
    const state = { position: { x: 1, y: 2, z: 3 }, velocity: { x: 0.25, y: -2, z: 100 } }
    const contact: PlayerBallContactEvent = {
      type: 'PLAYER_CONTACT', playerId: 'player', teamSide: 'B',
      ballPosition: { ...state.position }, ballVelocity: { ...state.velocity },
      playerPosition: { x: 1, y: 0, z: 3 },
    }
    const originalState = structuredClone(state)
    const originalContact = structuredClone(contact)
    const next = applyPlayerContactResponse(state, contact, 'PERFECT', 1, 1, 1)
    expect(next).toEqual({ position: state.position, velocity: { x: -2.75, y: 6.3, z: -7 } })
    expect(next.position).not.toBe(state.position)
    expect(state).toEqual(originalState)
    expect(contact).toEqual(originalContact)
    expect(applyPlayerContactResponse(state, contact, 'PERFECT', 1, 1, 0)).toEqual(
      applyPlayerContactResponse(state, contact, 'PERFECT', 1, 1),
    )
  })

  it.each([-1.01, 1.01, NaN, Infinity, -Infinity])('rejects invalid raw forward %s before returning a response', (raw) => {
    expect(() => getPlayerContactResponseVelocity(
      { x: 0, y: 0, z: 0 }, 'A', 'PERFECT', 0, 1, raw,
    )).toThrow(RangeError)
  })
})
