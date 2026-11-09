import { describe, expect, it } from 'vitest'
import { VOLLEYBALL_SIMULATION_CONFIG } from '@/game/ball/volleyballSimulationConfig'
import type { PlayerBallContactEvent } from '@/game/contact/playerBallContact'
import { createSetContactResponse } from '@/game/contact/setContactResponse'
import type { TeamSide } from '@/game/team/teamTypes'

const STEP = VOLLEYBALL_SIMULATION_CONFIG.fixedStepSeconds
const contact = (teamSide: TeamSide = 'A', incomingX = 0.4): PlayerBallContactEvent => ({
  type: 'PLAYER_CONTACT',
  playerId: 'player',
  teamSide,
  ballPosition: { x: 0.25, y: 1, z: 0.125 },
  playerPosition: { x: 0, y: 0, z: 0 },
  ballVelocity: { x: incomingX, y: -1.5, z: 2 },
})

describe('set contact physics', () => {
  it.each([
    ['A', 0, 0, 0, 'PERFECT', 1, 1, 0.1, 0.8],
    ['B', 0, 0, 0, 'PERFECT', 1, 1, 0.1, -0.8],
    ['A', 1, 1, 0, 'PERFECT', 1, 1, 1.7, 2.0],
    ['B', 1, 1, 0, 'PERFECT', 1, 1, -1.5, -2.0],
    ['A', 1, 1, -2, 'EARLY', 0.9, 0.85, 1.46, 1.74],
    ['B', 1, 1, -2, 'EARLY', 0.9, 0.85, -1.26, -1.74],
    ['A', 1, 1, -4, 'VERY_EARLY', 0.75, 0.60, 1.06, 1.32],
    ['B', 1, 1, -4, 'VERY_EARLY', 0.75, 0.60, -0.86, -1.32],
    ['A', -1, 0, 0, 'PERFECT', 1, 1, -1.5, 0.8],
    ['A', 0, -1, 0, 'PERFECT', 1, 1, 0.1, -0.4],
    ['B', 0, -1, 0, 'PERFECT', 1, 1, 0.1, 0.4],
    ['A', -0.5, 0.75, 2, 'LATE', 0.9, 0.85, -0.58, 1.485],
    ['B', -0.5, 0.75, 2, 'LATE', 0.9, 0.85, 0.78, -1.485],
    ['A', -1, -1, 5, 'VERY_LATE', 0.75, 0.60, -0.86, -0.12],
    ['B', -1, -1, 5, 'VERY_LATE', 0.75, 0.60, 1.06, 0.12],
  ] as const)('matches team %s, aim (%s, %s), offset %s and %s', (team, lateral, forward, offset, grade, power, accuracy, vx, vz) => {
    const response = createSetContactResponse(contact(team), 10 + offset, 10, STEP, lateral, forward)
    expect(response).toMatchObject({
      type: 'PLAYER_SET_RESPONSE', actionType: 'SET', playerId: 'player', teamSide: team,
      pressStep: 10 + offset, contactStep: 10, timingOffsetSteps: offset, timingOffsetSeconds: offset * STEP,
      timingGrade: grade, timingPowerMultiplier: power, timingAccuracyMultiplier: accuracy,
      aimLateral: lateral, aimForward: forward, effectiveAimLateral: lateral * accuracy, effectiveAimForward: forward * accuracy,
    })
    // Expected decimal values can differ from their binary representations.
    expect(response.outgoingVelocity.x).toBeCloseTo(vx, 12)
    expect(response.outgoingVelocity.y).toBe(7.0)
    expect(response.outgoingVelocity.z).toBeCloseTo(vz, 12)
  })

  it('retains one quarter of negative incoming X and replaces incoming Y and Z', () => {
    const response = createSetContactResponse(contact('A', -0.8), 0, 0, STEP, 0, 0)
    expect(response.outgoingVelocity).toEqual({ x: -0.2, y: 7, z: 0.8 })
  })

  it('snapshots all three vectors without mutating the contact', () => {
    const input = contact()
    const original = structuredClone(input)
    const response = createSetContactResponse(input, 0, 0, STEP, 0, 0)
    expect(input).toEqual(original)
    expect(Object.isFrozen(response)).toBe(true)
    expect([response.ballPosition, response.incomingVelocity, response.outgoingVelocity].every(Object.isFrozen)).toBe(true)
    expect(response.ballPosition).not.toBe(input.ballPosition)
    expect(response.incomingVelocity).not.toBe(input.ballVelocity)
    input.ballPosition.x = 999
    input.ballVelocity.x = 999
    expect(response.ballPosition).toEqual(original.ballPosition)
    expect(response.incomingVelocity).toEqual(original.ballVelocity)
  })

  it.each([NaN, Infinity, -Infinity, -1.001, 1.001])('rejects invalid aim %s on either axis', (invalid) => {
    expect(() => createSetContactResponse(contact(), 0, 0, STEP, invalid, 0)).toThrow(RangeError)
    expect(() => createSetContactResponse(contact(), 0, 0, STEP, 0, invalid)).toThrow(RangeError)
  })
})
