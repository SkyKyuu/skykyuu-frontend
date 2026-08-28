import { describe, expect, it } from 'vitest'
import type { BallSimulationEvent } from '@/game/ball/ballGroundContact'
import { FixedStepVolleyballSimulator } from '@/game/ball/FixedStepVolleyballSimulator'
import { createPreviewVolleyballState } from '@/game/ball/previewVolleyballState'
import { VOLLEYBALL_CONFIG } from '@/game/ball/volleyballConfig'
import { VOLLEYBALL_SIMULATION_CONFIG } from '@/game/ball/volleyballSimulationConfig'
import type { PlayerBallContactTarget } from '@/game/contact/playerBallContact'
import { PLAYER_CONTACT_RESPONSE_CONFIG } from '@/game/contact/playerBallContactResponseConfig'

const FIXED_STEP = VOLLEYBALL_SIMULATION_CONFIG.fixedStepSeconds

function createTarget(
  playerId: string,
  teamSide: 'A' | 'B',
  z = 0,
): PlayerBallContactTarget {
  return {
    playerId,
    teamSide,
    position: { x: 0, y: 0, z },
  }
}

describe('FixedStepVolleyballSimulator player contact response', () => {
  it('emits incoming contact before response and applies outgoing velocity', () => {
    const simulator = new FixedStepVolleyballSimulator({
      position: { x: 0, y: 1, z: 0 },
      velocity: {
        x: 1,
        y: -3 + VOLLEYBALL_SIMULATION_CONFIG.gravity * FIXED_STEP,
        z: 3,
      },
    })

    const result = simulator.advance(FIXED_STEP, [
      createTarget('player-b', 'B'),
    ])

    expect(result.events).toHaveLength(2)
    expect(result.events[0]).toMatchObject({
      type: 'PLAYER_CONTACT',
      playerId: 'player-b',
      teamSide: 'B',
      ballVelocity: { x: 1, y: -3, z: 3 },
    })
    expect(result.events[1]).toMatchObject({
      type: 'PLAYER_CONTACT_RESPONSE',
      playerId: 'player-b',
      teamSide: 'B',
      incomingVelocity: { x: 1, y: -3, z: 3 },
      outgoingVelocity: {
        x: 1,
        y: PLAYER_CONTACT_RESPONSE_CONFIG.upwardVelocity,
        z: -PLAYER_CONTACT_RESPONSE_CONFIG.forwardVelocity,
      },
    })
    expect(simulator.getState().velocity).toEqual({
      x: 1,
      y: PLAYER_CONTACT_RESPONSE_CONFIG.upwardVelocity,
      z: -PLAYER_CONTACT_RESPONSE_CONFIG.forwardVelocity,
    })
  })

  it('does not repeat contact or response while overlap remains active', () => {
    const simulator = new FixedStepVolleyballSimulator({
      position: { x: 0, y: 1, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
    })
    const target = createTarget('player-b', 'B')

    expect(simulator.advance(FIXED_STEP, [target]).events).toHaveLength(2)
    expect(simulator.advance(FIXED_STEP, [target]).events).toHaveLength(0)
    expect(simulator.advance(FIXED_STEP, [target]).events).toHaveLength(0)
  })

  it('responds only to the first simultaneous new contact in target order', () => {
    const simulator = new FixedStepVolleyballSimulator({
      position: { x: 0, y: 1, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
    })
    const firstTarget = createTarget('first-player', 'A')
    const secondTarget = createTarget('second-player', 'B')

    const result = simulator.advance(FIXED_STEP, [
      firstTarget,
      secondTarget,
    ])

    expect(result.events.map((event) => event.type)).toEqual([
      'PLAYER_CONTACT',
      'PLAYER_CONTACT',
      'PLAYER_CONTACT_RESPONSE',
    ])
    expect(result.events[0]).toMatchObject({ playerId: 'first-player' })
    expect(result.events[1]).toMatchObject({ playerId: 'second-player' })
    expect(result.events[2]).toMatchObject({
      playerId: 'first-player',
      teamSide: 'A',
      outgoingVelocity: {
        z: PLAYER_CONTACT_RESPONSE_CONFIG.forwardVelocity,
      },
    })
  })

  it('keeps ground contact terminal even with a new player overlap at impact', () => {
    const simulator = new FixedStepVolleyballSimulator({
      position: { x: 0, y: 0.11, z: 0 },
      velocity: { x: 0, y: -1, z: 0 },
    })

    const result = simulator.advance(FIXED_STEP, [
      createTarget('ground-player', 'B'),
    ])

    expect(result.events.map((event) => event.type)).toEqual([
      'PLAYER_CONTACT',
      'GROUND_CONTACT',
    ])
    expect(
      result.events.some(
        (event) => event.type === 'PLAYER_CONTACT_RESPONSE',
      ),
    ).toBe(false)
    expect(simulator.getState()).toMatchObject({
      position: { y: VOLLEYBALL_CONFIG.radius },
      velocity: { y: expect.any(Number) },
    })
    expect(simulator.getState().velocity.y).toBeLessThan(0)
    expect(simulator.advance(1, [createTarget('ground-player', 'B')])).toEqual({
      executedSteps: 0,
      events: [],
    })
  })

  it('runs the preview from Team B response through net crossing to IN side A', () => {
    const simulator = new FixedStepVolleyballSimulator(
      createPreviewVolleyballState(),
    )
    const targets = [
      createTarget('player-a', 'A', -4.5),
      createTarget('player-b', 'B', 4.5),
    ]
    const observedEvents: BallSimulationEvent[] = []
    let crossedCentreAfterResponse = false
    let responseObserved = false

    for (let frame = 0; frame < 300; frame += 1) {
      const result = simulator.advance(1 / 60, targets)
      observedEvents.push(...result.events)

      if (
        result.events.some(
          (event) => event.type === 'PLAYER_CONTACT_RESPONSE',
        )
      ) {
        responseObserved = true
      }

      if (responseObserved && simulator.getState().position.z <= 0) {
        crossedCentreAfterResponse = true
      }

      if (result.events.some((event) => event.type === 'GROUND_CONTACT')) {
        break
      }
    }

    expect(observedEvents.map((event) => event.type)).toEqual([
      'PLAYER_CONTACT',
      'PLAYER_CONTACT_RESPONSE',
      'GROUND_CONTACT',
    ])
    expect(observedEvents[0]).toMatchObject({
      playerId: 'player-b',
      teamSide: 'B',
    })
    expect(observedEvents[1]).toMatchObject({
      playerId: 'player-b',
      teamSide: 'B',
      outgoingVelocity: {
        y: PLAYER_CONTACT_RESPONSE_CONFIG.upwardVelocity,
        z: -PLAYER_CONTACT_RESPONSE_CONFIG.forwardVelocity,
      },
    })
    expect(observedEvents[2]).toMatchObject({
      type: 'GROUND_CONTACT',
      courtResult: 'IN',
      courtSide: 'A',
    })
    expect(crossedCentreAfterResponse).toBe(true)
    expect(
      observedEvents.some(
        (event) =>
          event.type === 'PLAYER_CONTACT' && event.playerId === 'player-a',
      ),
    ).toBe(false)
  })
})
