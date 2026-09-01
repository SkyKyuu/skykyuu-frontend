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
  ['VERY_EARLY', 0.75, 3.75],
  ['EARLY', 0.9, 4.5],
  ['PERFECT', 1, 5],
  ['LATE', 0.9, 4.5],
  ['VERY_LATE', 0.75, 3.75],
] as const satisfies readonly (readonly [
  PlayerHitTimingGrade,
  number,
  number,
])[]

describe('player contact response math', () => {
  it.each(TIMING_POWER_CASES)(
    'applies %s power x%f to Team A forward velocity',
    (grade, _multiplier, expectedForwardVelocity) => {
      const incomingVelocity = { x: 1, y: -2, z: 3 }

      expect(
        getPlayerContactResponseVelocity(incomingVelocity, 'A', grade),
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
    (grade, _multiplier, expectedForwardVelocity) => {
      expect(
        getPlayerContactResponseVelocity(
          { x: 1, y: -2, z: 3 },
          'B',
          grade,
        ),
      ).toEqual({
        x: 1,
        y: PLAYER_CONTACT_RESPONSE_CONFIG.upwardVelocity,
        z: -expectedForwardVelocity,
      })
    },
  )

  it('preserves the exact pre-F2.11 baseline for PERFECT timing', () => {
    expect(
      getPlayerContactResponseVelocity(
        { x: 0.25, y: -2, z: 3 },
        'A',
        'PERFECT',
      ),
    ).toEqual({ x: 0.25, y: 6.3, z: 5 })
    expect(
      getPlayerContactResponseVelocity(
        { x: 0.25, y: -2, z: 3 },
        'B',
        'PERFECT',
      ),
    ).toEqual({ x: 0.25, y: 6.3, z: -5 })
  })

  it('preserves position and leaves source state and contact immutable', () => {
    const state = {
      position: { x: 1, y: 2, z: 3 },
      velocity: { x: 4, y: -3, z: 5 },
    }
    const originalState = structuredClone(state)
    const originalContact = structuredClone(CONTACT)

    const nextState = applyPlayerContactResponse(state, CONTACT, 'EARLY')

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
    const outgoingVelocity = { x: 4, y: 6.3, z: -4.5 }
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
      -0.75,
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
      outgoingVelocity: { x: 4, y: 6.3, z: -4.5 },
      hitTimingOffsetSteps: -2,
      hitTimingOffsetSeconds:
        -2 * VOLLEYBALL_SIMULATION_CONFIG.fixedStepSeconds,
      hitTimingGrade: 'EARLY',
      hitTimingForwardMultiplier: 0.9,
      hitAimLateral: -0.75,
    })
  })
})
