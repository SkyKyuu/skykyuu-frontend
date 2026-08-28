import { describe, expect, it } from 'vitest'
import type { PlayerBallContactEvent } from '@/game/contact/playerBallContact'
import {
  applyPlayerContactResponse,
  createPlayerBallContactResponseEvent,
  getDefaultPlayerContactResponseVelocity,
} from '@/game/contact/playerBallContactResponse'
import { PLAYER_CONTACT_RESPONSE_CONFIG } from '@/game/contact/playerBallContactResponseConfig'

const CONTACT: PlayerBallContactEvent = {
  type: 'PLAYER_CONTACT',
  playerId: 'player-test',
  teamSide: 'B',
  ballPosition: { x: 1, y: 2, z: 3 },
  ballVelocity: { x: 4, y: -3, z: 5 },
  playerPosition: { x: 1, y: 0, z: 3 },
}

describe('default player contact response math', () => {
  it('preserves X and sends a Team A response upward and toward positive Z', () => {
    const incomingVelocity = { x: 1, y: -2, z: 3 }

    expect(
      getDefaultPlayerContactResponseVelocity(incomingVelocity, 'A'),
    ).toEqual({
      x: 1,
      y: PLAYER_CONTACT_RESPONSE_CONFIG.upwardVelocity,
      z: PLAYER_CONTACT_RESPONSE_CONFIG.forwardVelocity,
    })
    expect(incomingVelocity).toEqual({ x: 1, y: -2, z: 3 })
  })

  it('preserves X and sends a Team B response upward and toward negative Z', () => {
    expect(
      getDefaultPlayerContactResponseVelocity({ x: 1, y: -2, z: 3 }, 'B'),
    ).toEqual({
      x: 1,
      y: PLAYER_CONTACT_RESPONSE_CONFIG.upwardVelocity,
      z: -PLAYER_CONTACT_RESPONSE_CONFIG.forwardVelocity,
    })
  })

  it('preserves position and leaves source state and contact immutable', () => {
    const state = {
      position: { x: 1, y: 2, z: 3 },
      velocity: { x: 4, y: -3, z: 5 },
    }
    const originalState = structuredClone(state)
    const originalContact = structuredClone(CONTACT)

    const nextState = applyPlayerContactResponse(state, CONTACT)

    expect(nextState).toEqual({
      position: state.position,
      velocity: {
        x: 4,
        y: PLAYER_CONTACT_RESPONSE_CONFIG.upwardVelocity,
        z: -PLAYER_CONTACT_RESPONSE_CONFIG.forwardVelocity,
      },
    })
    expect(nextState.position).not.toBe(state.position)
    expect(nextState.velocity).not.toBe(state.velocity)
    expect(state).toEqual(originalState)
    expect(CONTACT).toEqual(originalContact)
  })

  it('copies the incoming and outgoing values into a response event', () => {
    const contact = structuredClone(CONTACT)
    const outgoingVelocity = { x: 4, y: 6.3, z: -5 }
    const response = createPlayerBallContactResponseEvent(
      contact,
      outgoingVelocity,
    )

    contact.ballPosition.x = 99
    contact.ballVelocity.y = 99
    outgoingVelocity.z = 99

    expect(response).toEqual({
      type: 'PLAYER_CONTACT_RESPONSE',
      playerId: 'player-test',
      teamSide: 'B',
      ballPosition: { x: 1, y: 2, z: 3 },
      incomingVelocity: { x: 4, y: -3, z: 5 },
      outgoingVelocity: { x: 4, y: 6.3, z: -5 },
    })
  })
})
