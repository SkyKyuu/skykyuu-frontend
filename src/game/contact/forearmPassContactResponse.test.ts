import { describe, expect, it } from 'vitest'
import { createForearmPassContactResponse } from '@/game/contact/forearmPassContactResponse'
import { FOREARM_PASS_PHYSICS_CONFIG } from '@/game/contact/forearmPassPhysicsConfig'
import type { PlayerBallContactEvent } from '@/game/contact/playerBallContact'
import type { TeamSide } from '@/game/team/teamTypes'

function contact(teamSide: TeamSide = 'A'): PlayerBallContactEvent {
  return {
    type: 'PLAYER_CONTACT', playerId: 'player', teamSide,
    ballPosition: { x: 0, y: 1, z: 0 }, ballVelocity: { x: 0.25, y: -2, z: 3 },
    playerPosition: { x: 0, y: 0, z: 0 },
  }
}

const STEP = 1 / 60

describe('forearm pass response', () => {
  it('uses only the four approved parameters', () => {
    expect(FOREARM_PASS_PHYSICS_CONFIG).toEqual({ upwardVelocity: 5, forwardVelocity: 3.5, maxLateralVelocityContribution: 2, maxForwardVelocityContribution: 1.5 })
  })

  it.each([
    ['A', 0, 0, 0, 0.25, 3.5], ['B', 0, 0, 0, 0.25, -3.5],
    ['A', 0, 1, 1, 2.25, 5], ['B', 0, 1, 1, -1.75, -5],
    ['A', -1, 1, 1, 1.95, 4.425], ['B', -1, 1, 1, -1.45, -4.425],
    ['A', 0, -1, 0, -1.75, 3.5], ['B', 0, -1, 0, 2.25, -3.5],
    ['A', 0, 0, -1, 0.25, 2], ['B', 0, 0, -1, 0.25, -2],
    ['A', 0, 1, 0, 2.25, 3.5], ['A', 0, 0, 1, 0.25, 5],
    ['A', 0, -0.6, 0.8, -0.95, 4.7],
  ] as const)('Team %s offset=%s lateral=%s forward=%s yields X=%s Z=%s', (team, offset, lateral, forward, x, z) => {
    const response = createForearmPassContactResponse(contact(team), 10 + offset, 10, STEP, lateral, forward)
    expect(response.outgoingVelocity.x).toBeCloseTo(x, 12)
    expect(response.outgoingVelocity.y).toBe(5)
    expect(response.outgoingVelocity.z).toBeCloseTo(z, 12)
    expect(response.incomingVelocity).toEqual({ x: 0.25, y: -2, z: 3 })
  })

  it.each([
    [-5, 'VERY_EARLY', 0.75, 0.6], [-4, 'VERY_EARLY', 0.75, 0.6], [-3, 'EARLY', 0.9, 0.85],
    [-1, 'EARLY', 0.9, 0.85], [0, 'PERFECT', 1, 1], [1, 'LATE', 0.9, 0.85],
    [3, 'LATE', 0.9, 0.85], [4, 'VERY_LATE', 0.75, 0.6], [9, 'VERY_LATE', 0.75, 0.6],
  ] as const)('offset %s shares %s timing with power %s and accuracy %s', (offset, grade, power, accuracy) => {
    const response = createForearmPassContactResponse(contact(), 10 + offset, 10, STEP, -0.5, 0.5)
    expect(response).toMatchObject({
      pressStep: 10 + offset, contactStep: 10, timingOffsetSteps: offset, timingOffsetSeconds: offset * STEP,
      timingGrade: grade, timingPowerMultiplier: power, timingAccuracyMultiplier: accuracy,
      aimLateral: -0.5, aimForward: 0.5, effectiveAimLateral: -0.5 * accuracy, effectiveAimForward: 0.5 * accuracy,
    })
    expect(response.outgoingVelocity).toEqual({ x: 0.25 - accuracy, y: 5, z: 3.5 * power + 0.75 * accuracy })
  })

  it.each([NaN, Infinity, -Infinity, 1.01, -1.01])('rejects invalid aim %s on either axis without mutating input', (aim) => {
    const source = contact()
    const original = structuredClone(source)
    expect(() => createForearmPassContactResponse(source, 0, 0, STEP, aim, 0)).toThrow(RangeError)
    expect(() => createForearmPassContactResponse(source, 0, 0, STEP, 0, aim)).toThrow(RangeError)
    expect(source).toEqual(original)
  })

  it('snapshots and freezes the event vectors without changing its source', () => {
    const source = contact()
    const original = structuredClone(source)
    const response = createForearmPassContactResponse(source, 0, 0, STEP, 0, 0)
    expect(source).toEqual(original)
    source.ballPosition.y = 8
    source.ballVelocity.x = 20
    expect(response).toMatchObject({ type: 'PLAYER_FOREARM_PASS_RESPONSE', actionType: 'FOREARM_PASS', playerId: 'player', ballPosition: original.ballPosition, incomingVelocity: original.ballVelocity })
    expect(Reflect.set(response.outgoingVelocity, 'y', 20)).toBe(false)
    expect(Reflect.set(response.ballPosition, 'y', 20)).toBe(false)
  })
})
