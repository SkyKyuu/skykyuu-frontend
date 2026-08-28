import { describe, expect, it } from 'vitest'
import { FixedStepVolleyballSimulator } from '@/game/ball/FixedStepVolleyballSimulator'
import { createPreviewVolleyballState } from '@/game/ball/previewVolleyballState'
import { VOLLEYBALL_CONFIG } from '@/game/ball/volleyballConfig'
import { VOLLEYBALL_SIMULATION_CONFIG } from '@/game/ball/volleyballSimulationConfig'
import { stepVolleyballFreeFlight } from '@/game/ball/volleyballSimulationMath'
import type {
  PlayerBallContactEvent,
  PlayerBallContactTarget,
} from '@/game/contact/playerBallContact'

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
  it('detects contact in every fixed substep but emits only on entry', () => {
    const simulator = new FixedStepVolleyballSimulator({
      position: { x: 0, y: 1, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
    })

    const result = simulator.advance(1 / 30, [createTarget('player-b')])

    expect(result.executedSteps).toBe(2)
    expect(result.events).toHaveLength(1)
    expect(result.events[0]).toMatchObject({
      type: 'PLAYER_CONTACT',
      playerId: 'player-b',
      teamSide: 'B',
    })
  })

  it('does not alter free-flight position or velocity on contact', () => {
    const initialState = {
      position: { x: 0, y: 1, z: 0 },
      velocity: { x: 0.25, y: 0.5, z: 0.75 },
    }
    const simulator = new FixedStepVolleyballSimulator(initialState)

    const result = simulator.advance(FIXED_STEP, [createTarget('player-b')])

    expect(result.events[0]?.type).toBe('PLAYER_CONTACT')
    expect(simulator.getState()).toEqual(
      stepVolleyballFreeFlight(initialState, FIXED_STEP),
    )
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

    expect(firstEntry.events).toHaveLength(1)
    expect(leave.events).toHaveLength(0)
    expect(secondEntry.events).toHaveLength(1)
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

    expect(result.events).toHaveLength(1)
    expect(result.events[0]).toMatchObject({
      type: 'PLAYER_CONTACT',
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

    expect(simulator.advance(FIXED_STEP, [target]).events).toHaveLength(1)
    simulator.reset(initialState)
    expect(simulator.advance(FIXED_STEP, [target]).events).toHaveLength(1)
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

  it('emits preview player contact before its IN side-B landing', () => {
    const simulator = new FixedStepVolleyballSimulator(
      createPreviewVolleyballState(),
    )
    const teamBTarget = createTarget('team-b-player', 0, 0, 4.5)
    const observedEvents: Array<
      PlayerBallContactEvent | { type: 'GROUND_CONTACT'; courtResult: string; courtSide: string }
    > = []

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

    expect(playerContactIndex).toBeGreaterThanOrEqual(0)
    expect(groundContactIndex).toBeGreaterThan(playerContactIndex)
    expect(observedEvents[playerContactIndex]).toMatchObject({
      type: 'PLAYER_CONTACT',
      playerId: 'team-b-player',
      teamSide: 'B',
    })
    expect(observedEvents[groundContactIndex]).toMatchObject({
      type: 'GROUND_CONTACT',
      courtResult: 'IN',
      courtSide: 'B',
    })
  })
})
