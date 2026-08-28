import { describe, expect, it } from 'vitest'
import { FixedStepVolleyballSimulator } from '@/game/ball/FixedStepVolleyballSimulator'
import { createPreviewVolleyballState } from '@/game/ball/previewVolleyballState'
import { VOLLEYBALL_CONFIG } from '@/game/ball/volleyballConfig'
import { VOLLEYBALL_SIMULATION_CONFIG } from '@/game/ball/volleyballSimulationConfig'
import { stepVolleyballFreeFlight } from '@/game/ball/volleyballSimulationMath'
import type { BallSimulationEvent } from '@/game/ball/ballGroundContact'
import type { PlayerBallContactTarget } from '@/game/contact/playerBallContact'
import { PLAYER_CONTACT_RESPONSE_CONFIG } from '@/game/contact/playerBallContactResponseConfig'

const FIXED_STEP = VOLLEYBALL_SIMULATION_CONFIG.fixedStepSeconds

function createTarget(
  playerId: string,
  x = 0,
  y = 0,
  z = 0,
): PlayerBallContactTarget {
  return {
    playerId,
    teamSide: z < 0 ? 'A' : 'B',
    position: { x, y, z },
  }
}

describe('FixedStepVolleyballSimulator player contact integration', () => {
  it('detects and responds in fixed substeps only on overlap entry', () => {
    const simulator = new FixedStepVolleyballSimulator({
      position: { x: 0, y: 1, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
    })

    const result = simulator.advance(1 / 30, [createTarget('player-b')])

    expect(result.executedSteps).toBe(2)
    expect(result.events).toHaveLength(2)
    expect(result.events).toMatchObject([{
      type: 'PLAYER_CONTACT',
      playerId: 'player-b',
      teamSide: 'B',
    }, {
      type: 'PLAYER_CONTACT_RESPONSE',
      playerId: 'player-b',
      teamSide: 'B',
    }])
  })

  it('preserves free-flight position and records incoming velocity before response', () => {
    const initialState = {
      position: { x: 0, y: 1, z: 0 },
      velocity: { x: 0.25, y: 0.5, z: 0.75 },
    }
    const simulator = new FixedStepVolleyballSimulator(initialState)

    const result = simulator.advance(FIXED_STEP, [createTarget('player-b')])
    const freeFlightState = stepVolleyballFreeFlight(initialState, FIXED_STEP)

    expect(result.events[0]?.type).toBe('PLAYER_CONTACT')
    expect(result.events[0]).toMatchObject({
      ballVelocity: freeFlightState.velocity,
    })
    expect(simulator.getState()).toEqual({
      position: freeFlightState.position,
      velocity: {
        x: freeFlightState.velocity.x,
        y: PLAYER_CONTACT_RESPONSE_CONFIG.upwardVelocity,
        z: -PLAYER_CONTACT_RESPONSE_CONFIG.forwardVelocity,
      },
    })
  })

  it('emits a second event after the ball leaves and re-enters overlap', () => {
    const simulator = new FixedStepVolleyballSimulator({
      position: { x: 0, y: 1, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
    })
    const nearTarget = createTarget('player-b')
    const farTarget = createTarget('player-b', 10)

    const firstEntry = simulator.advance(FIXED_STEP, [nearTarget])
    const leave = simulator.advance(FIXED_STEP, [farTarget])
    const secondEntry = simulator.advance(FIXED_STEP, [nearTarget])

    expect(firstEntry.events).toHaveLength(2)
    expect(leave.events).toHaveLength(0)
    expect(secondEntry.events).toHaveLength(2)
  })

  it('emits contact only for overlapping players', () => {
    const simulator = new FixedStepVolleyballSimulator({
      position: { x: 0, y: 1, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
    })

    const result = simulator.advance(FIXED_STEP, [
      createTarget('far-player', 10),
      createTarget('near-player'),
    ])

    expect(result.events).toHaveLength(2)
    expect(result.events[0]).toMatchObject({
      type: 'PLAYER_CONTACT',
      playerId: 'near-player',
    })
    expect(result.events[1]).toMatchObject({
      type: 'PLAYER_CONTACT_RESPONSE',
      playerId: 'near-player',
    })
  })

  it('clears active player contacts on reset', () => {
    const initialState = {
      position: { x: 0, y: 1, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
    }
    const target = createTarget('player-b')
    const simulator = new FixedStepVolleyballSimulator(initialState)

    expect(simulator.advance(FIXED_STEP, [target]).events).toHaveLength(2)
    simulator.reset(initialState)
    expect(simulator.advance(FIXED_STEP, [target]).events).toHaveLength(2)
  })

  it('preserves F2.3 ground contact with no player targets', () => {
    const simulator = new FixedStepVolleyballSimulator({
      position: { x: 0, y: 0.11, z: 1 },
      velocity: { x: 0, y: -1, z: 0 },
    })

    const result = simulator.advance(FIXED_STEP, [])

    expect(result.events).toHaveLength(1)
    expect(result.events[0]).toMatchObject({
      type: 'GROUND_CONTACT',
      courtResult: 'IN',
      courtSide: 'B',
      position: { y: VOLLEYBALL_CONFIG.radius },
    })
  })

  it('responds to preview Team B contact before its IN side-A landing', () => {
    const simulator = new FixedStepVolleyballSimulator(
      createPreviewVolleyballState(),
    )
    const teamBTarget = createTarget('team-b-player', 0, 0, 4.5)
    const observedEvents: BallSimulationEvent[] = []

    for (let frame = 0; frame < 180; frame += 1) {
      const result = simulator.advance(1 / 60, [teamBTarget])
      observedEvents.push(...result.events)

      if (result.events.some((event) => event.type === 'GROUND_CONTACT')) {
        break
      }
    }

    const playerContactIndex = observedEvents.findIndex(
      (event) => event.type === 'PLAYER_CONTACT',
    )
    const groundContactIndex = observedEvents.findIndex(
      (event) => event.type === 'GROUND_CONTACT',
    )
    const responseIndex = observedEvents.findIndex(
      (event) => event.type === 'PLAYER_CONTACT_RESPONSE',
    )

    expect(playerContactIndex).toBeGreaterThanOrEqual(0)
    expect(responseIndex).toBe(playerContactIndex + 1)
    expect(groundContactIndex).toBeGreaterThan(responseIndex)
    expect(observedEvents[playerContactIndex]).toMatchObject({
      type: 'PLAYER_CONTACT',
      playerId: 'team-b-player',
      teamSide: 'B',
    })
    expect(observedEvents[groundContactIndex]).toMatchObject({
      type: 'GROUND_CONTACT',
      courtResult: 'IN',
      courtSide: 'A',
    })
  })
})
