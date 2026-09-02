import { describe, expect, it } from 'vitest'
import { VOLLEYBALL_SIMULATION_CONFIG } from '@/game/ball/volleyballSimulationConfig'
import type { PlayerBallContactEvent } from '@/game/contact/playerBallContact'
import {
  applyPlayerContactResponse,
  createPlayerBallContactResponseEvent,
  getPlayerContactResponseVelocity,
} from '@/game/contact/playerBallContactResponse'
import { PLAYER_CONTACT_RESPONSE_CONFIG } from '@/game/contact/playerBallContactResponseConfig'
import type { PlayerHitTimingGrade } from '@/game/contact/playerHitTimingGrade'

const CONTACT: PlayerBallContactEvent = {
  type: 'PLAYER_CONTACT',
  playerId: 'player-test',
  teamSide: 'B',
  ballPosition: { x: 1, y: 2, z: 3 },
  ballVelocity: { x: 4, y: -3, z: 5 },
  playerPosition: { x: 1, y: 0, z: 3 },
}

const TIMING_POWER_CASES = [
  ['VERY_EARLY', 0.75, 0.6, 3.75],
  ['EARLY', 0.9, 0.85, 4.5],
  ['PERFECT', 1, 1, 5],
  ['LATE', 0.9, 0.85, 4.5],
  ['VERY_LATE', 0.75, 0.6, 3.75],
] as const satisfies readonly (readonly [
  PlayerHitTimingGrade,
  number,
  number,
  number,
])[]

const TIMING_ACCURACY_CASES = [
  ['VERY_EARLY', 0.6, 2.05, -1.55, -3.75],
  ['EARLY', 0.85, 2.8, -2.3, -4.5],
  ['PERFECT', 1, 3.25, -2.75, -5],
  ['LATE', 0.85, 2.8, -2.3, -4.5],
  ['VERY_LATE', 0.6, 2.05, -1.55, -3.75],
] as const satisfies readonly (readonly [
  PlayerHitTimingGrade,
  number,
  number,
  number,
  number,
])[]

describe('player contact response math', () => {
  it.each(TIMING_POWER_CASES)(
    'applies %s power x%f to Team A forward velocity',
    (grade, _powerMultiplier, accuracyMultiplier, expectedForwardVelocity) => {
      const incomingVelocity = { x: 1, y: -2, z: 3 }

      expect(
        getPlayerContactResponseVelocity(
          incomingVelocity,
          'A',
          grade,
          0,
          accuracyMultiplier,
        ),
      ).toEqual({
        x: 1,
        y: PLAYER_CONTACT_RESPONSE_CONFIG.upwardVelocity,
        z: expectedForwardVelocity,
      })
      expect(incomingVelocity).toEqual({ x: 1, y: -2, z: 3 })
    },
  )

  it.each(TIMING_POWER_CASES)(
    'applies %s power x%f to Team B forward velocity',
    (grade, _powerMultiplier, accuracyMultiplier, expectedForwardVelocity) => {
      expect(
        getPlayerContactResponseVelocity(
          { x: 1, y: -2, z: 3 },
          'B',
          grade,
          0,
          accuracyMultiplier,
        ),
      ).toEqual({
        x: 1,
        y: PLAYER_CONTACT_RESPONSE_CONFIG.upwardVelocity,
        z: -expectedForwardVelocity,
      })
    },
  )

  it('preserves the exact pre-F2.13 baseline for neutral PERFECT timing', () => {
    expect(
      getPlayerContactResponseVelocity(
        { x: 0.25, y: -2, z: 3 },
        'A',
        'PERFECT',
        0,
        1,
      ),
    ).toEqual({ x: 0.25, y: 6.3, z: 5 })
    expect(
      getPlayerContactResponseVelocity(
        { x: 0.25, y: -2, z: 3 },
        'B',
        'PERFECT',
        0,
        1,
      ),
    ).toEqual({ x: 0.25, y: 6.3, z: -5 })
  })

  it.each([
    [-1, -2.75],
    [0, 0.25],
    [1, 3.25],
  ] as const)(
    'adds Team A local aim %f to incoming lateral momentum',
    (aimLateral, expectedX) => {
      expect(
        getPlayerContactResponseVelocity(
          { x: 0.25, y: -2, z: 3 },
          'A',
          'PERFECT',
          aimLateral,
          1,
        ),
      ).toEqual({ x: expectedX, y: 6.3, z: 5 })
    },
  )

  it.each([
    [-1, 3.25],
    [0, 0.25],
    [1, -2.75],
  ] as const)(
    'adds inverted Team B local aim %f to incoming lateral momentum',
    (aimLateral, expectedX) => {
      expect(
        getPlayerContactResponseVelocity(
          { x: 0.25, y: -2, z: 3 },
          'B',
          'PERFECT',
          aimLateral,
          1,
        ),
      ).toEqual({ x: expectedX, y: 6.3, z: -5 })
    },
  )

  it('preserves analog aim magnitude without clamping outgoing X', () => {
    expect(
      getPlayerContactResponseVelocity(
        { x: 0.25, y: -2, z: 3 },
        'A',
        'PERFECT',
        0.5,
        1,
      ),
    ).toEqual({ x: 1.75, y: 6.3, z: 5 })
  })

  it.each(TIMING_ACCURACY_CASES)(
    'applies %s accuracy x%f only to Team A hit-created lateral contribution',
    (grade, accuracy, expectedX, _expectedTeamBX, expectedTeamBZ) => {
      const response = getPlayerContactResponseVelocity(
        { x: 0.25, y: -2, z: 3 },
        'A',
        grade,
        1,
        accuracy,
      )

      expect(response.x).toBeCloseTo(expectedX)
      expect(response.y).toBe(6.3)
      expect(response.z).toBe(-expectedTeamBZ)
    },
  )

  it.each(TIMING_ACCURACY_CASES)(
    'applies %s accuracy x%f to Team B aim while keeping Vz on timing power',
    (grade, accuracy, _expectedTeamAX, expectedX, expectedZ) => {
      const response = getPlayerContactResponseVelocity(
        { x: 0.25, y: -2, z: 3 },
        'B',
        grade,
        1,
        accuracy,
      )

      expect(response.x).toBeCloseTo(expectedX)
      expect(response.y).toBe(6.3)
      expect(response.z).toBe(expectedZ)
    },
  )

  it('preserves incoming lateral momentum instead of scaling it by accuracy', () => {
    const response = getPlayerContactResponseVelocity(
      { x: 2, y: -2, z: 3 },
      'B',
      'EARLY',
      1,
      0.85,
    )

    expect(response.x).toBeCloseTo(-0.55)
    expect(response.y).toBe(6.3)
    expect(response.z).toBe(-4.5)
  })

  it('preserves position and leaves source state and contact immutable', () => {
    const state = {
      position: { x: 1, y: 2, z: 3 },
      velocity: { x: 4, y: -3, z: 5 },
    }
    const originalState = structuredClone(state)
    const originalContact = structuredClone(CONTACT)

    const nextState = applyPlayerContactResponse(
      state,
      CONTACT,
      'EARLY',
      0,
      0.85,
    )

    expect(nextState).toEqual({
      position: state.position,
      velocity: {
        x: 4,
        y: PLAYER_CONTACT_RESPONSE_CONFIG.upwardVelocity,
        z: -4.5,
      },
    })
    expect(nextState.position).not.toBe(state.position)
    expect(nextState.velocity).not.toBe(state.velocity)
    expect(state).toEqual(originalState)
    expect(CONTACT).toEqual(originalContact)
  })

  it('copies the incoming and outgoing values into a response event', () => {
    const contact = structuredClone(CONTACT)
    const outgoingVelocity = { x: 5.9125, y: 6.3, z: -4.5 }
    const hitTiming = {
      offsetSteps: -2,
      offsetSeconds:
        -2 * VOLLEYBALL_SIMULATION_CONFIG.fixedStepSeconds,
    }
    const response = createPlayerBallContactResponseEvent(
      contact,
      outgoingVelocity,
      hitTiming,
      'EARLY',
      0.9,
      0.85,
      -0.75,
      0.375,
      0.75,
      -0.6375,
      0.6375,
      1.9124999999999999,
    )

    contact.ballPosition.x = 99
    contact.ballVelocity.y = 99
    outgoingVelocity.z = 99
    hitTiming.offsetSteps = 99

    expect(response).toEqual({
      type: 'PLAYER_CONTACT_RESPONSE',
      playerId: 'player-test',
      teamSide: 'B',
      ballPosition: { x: 1, y: 2, z: 3 },
      incomingVelocity: { x: 4, y: -3, z: 5 },
      outgoingVelocity: { x: 5.9125, y: 6.3, z: -4.5 },
      hitTimingOffsetSteps: -2,
      hitTimingOffsetSeconds:
        -2 * VOLLEYBALL_SIMULATION_CONFIG.fixedStepSeconds,
      hitTimingGrade: 'EARLY',
      hitTimingForwardMultiplier: 0.9,
      hitTimingAccuracyMultiplier: 0.85,
      hitAimLateral: -0.75,
      hitAimForward: 0.375,
      hitAimWorldX: 0.75,
      hitEffectiveAimLateral: -0.6375,
      hitEffectiveAimWorldX: 0.6375,
      hitAimVelocityX: 1.9124999999999999,
    })
  })
})
