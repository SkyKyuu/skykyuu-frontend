import { describe, expect, it } from 'vitest'
import type { BallSimulationEvent } from '@/game/ball/ballGroundContact'
import { FixedStepVolleyballSimulator } from '@/game/ball/FixedStepVolleyballSimulator'
import { createPreviewVolleyballState } from '@/game/ball/previewVolleyballState'
import { VOLLEYBALL_CONFIG } from '@/game/ball/volleyballConfig'
import { VOLLEYBALL_SIMULATION_CONFIG } from '@/game/ball/volleyballSimulationConfig'
import { stepVolleyballFreeFlight } from '@/game/ball/volleyballSimulationMath'
import type { PlayerBallContactTarget } from '@/game/contact/playerBallContact'
import { PLAYER_CONTACT_RESPONSE_CONFIG } from '@/game/contact/playerBallContactResponseConfig'
import type { PlayerHitIntent } from '@/game/contact/playerHitIntent'

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

function createIntent(
  playerId: string,
  {
    hitHeld = true,
    hitPressed = true,
  }: { hitHeld?: boolean; hitPressed?: boolean } = {},
): PlayerHitIntent {
  return { playerId, hitHeld, hitPressed }
}

describe('FixedStepVolleyballSimulator hit-gated player contact response', () => {
  it('emits a new contact without response and preserves free flight when no hit is pressed', () => {
    const initialState = {
      position: { x: 0, y: 1, z: 0 },
      velocity: { x: 1, y: -3, z: 3 },
    }
    const simulator = new FixedStepVolleyballSimulator(initialState)
    const freeFlightState = stepVolleyballFreeFlight(initialState, FIXED_STEP)

    const result = simulator.advance(FIXED_STEP, [
      createTarget('player-b', 'B'),
    ])

    expect(result.events).toEqual([
      expect.objectContaining({
        type: 'PLAYER_CONTACT',
        playerId: 'player-b',
        teamSide: 'B',
      }),
    ])
    expect(simulator.getState()).toEqual(freeFlightState)
  })

  it('emits contact before response and applies outgoing velocity for a hit on entry', () => {
    const simulator = new FixedStepVolleyballSimulator({
      position: { x: 0, y: 1, z: 0 },
      velocity: {
        x: 1,
        y: -3 + VOLLEYBALL_SIMULATION_CONFIG.gravity * FIXED_STEP,
        z: 3,
      },
    })

    const result = simulator.advance(
      FIXED_STEP,
      [createTarget('player-b', 'B')],
      [createIntent('player-b')],
    )

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
  })

  it('does not respond to hitHeld without hitPressed', () => {
    const simulator = new FixedStepVolleyballSimulator({
      position: { x: 0, y: 1, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
    })

    const result = simulator.advance(
      FIXED_STEP,
      [createTarget('player-b', 'B')],
      [createIntent('player-b', { hitHeld: true, hitPressed: false })],
    )

    expect(result.events.map((event) => event.type)).toEqual([
      'PLAYER_CONTACT',
    ])
  })

  it('responds during an existing overlap using the current response snapshot', () => {
    const initialState = {
      position: { x: 0, y: 1, z: 0 },
      velocity: { x: 0.25, y: 0.5, z: 0.75 },
    }
    const target = createTarget('player-b', 'B')
    const simulator = new FixedStepVolleyballSimulator(initialState)
    const stepOneState = stepVolleyballFreeFlight(initialState, FIXED_STEP)
    const stepTwoIncomingState = stepVolleyballFreeFlight(
      stepOneState,
      FIXED_STEP,
    )

    const entry = simulator.advance(FIXED_STEP, [target])
    const hit = simulator.advance(
      FIXED_STEP,
      [target],
      [createIntent('player-b')],
    )

    expect(entry.events.map((event) => event.type)).toEqual([
      'PLAYER_CONTACT',
    ])
    expect(hit.events).toHaveLength(1)
    expect(hit.events[0]).toEqual({
      type: 'PLAYER_CONTACT_RESPONSE',
      playerId: 'player-b',
      teamSide: 'B',
      ballPosition: stepTwoIncomingState.position,
      incomingVelocity: stepTwoIncomingState.velocity,
      outgoingVelocity: {
        x: stepTwoIncomingState.velocity.x,
        y: PLAYER_CONTACT_RESPONSE_CONFIG.upwardVelocity,
        z: -PLAYER_CONTACT_RESPONSE_CONFIG.forwardVelocity,
      },
    })
  })

  it('does not repeat a response after it is consumed in the same overlap', () => {
    const simulator = new FixedStepVolleyballSimulator({
      position: { x: 0, y: 1, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
    })
    const target = createTarget('player-b', 'B')
    const intent = createIntent('player-b')

    expect(
      simulator.advance(FIXED_STEP, [target], [intent]).events,
    ).toHaveLength(2)
    expect(
      simulator.advance(FIXED_STEP, [target], [intent]).events,
    ).toEqual([])
  })

  it('allows another response after leaving and re-entering overlap', () => {
    const simulator = new FixedStepVolleyballSimulator({
      position: { x: 0, y: 1, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
    })
    const nearTarget = createTarget('player-b', 'B')
    const farTarget = {
      ...nearTarget,
      position: { x: 10, y: 0, z: 0 },
    }
    const intent = createIntent('player-b')

    expect(
      simulator.advance(FIXED_STEP, [nearTarget], [intent]).events,
    ).toHaveLength(2)
    expect(
      simulator.advance(FIXED_STEP, [farTarget], [intent]).events,
    ).toEqual([])
    expect(
      simulator.advance(FIXED_STEP, [nearTarget], [intent]).events.map(
        (event) => event.type,
      ),
    ).toEqual(['PLAYER_CONTACT', 'PLAYER_CONTACT_RESPONSE'])
  })

  it('does not buffer a hit pressed before overlap', () => {
    const simulator = new FixedStepVolleyballSimulator({
      position: { x: 0, y: 1, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
    })
    const nearTarget = createTarget('player-b', 'B')
    const farTarget = {
      ...nearTarget,
      position: { x: 10, y: 0, z: 0 },
    }

    expect(
      simulator.advance(
        FIXED_STEP,
        [farTarget],
        [createIntent('player-b')],
      ).events,
    ).toEqual([])
    expect(
      simulator.advance(FIXED_STEP, [nearTarget]).events.map(
        (event) => event.type,
      ),
    ).toEqual(['PLAYER_CONTACT'])
  })

  it('does not apply another player intent to the overlapping target', () => {
    const simulator = new FixedStepVolleyballSimulator({
      position: { x: 0, y: 1, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
    })

    const result = simulator.advance(
      FIXED_STEP,
      [createTarget('player-b', 'B')],
      [createIntent('player-a')],
    )

    expect(result.events.map((event) => event.type)).toEqual([
      'PLAYER_CONTACT',
    ])
  })

  it('responds only to the first eligible overlapping target in stable target order', () => {
    const simulator = new FixedStepVolleyballSimulator({
      position: { x: 0, y: 1, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
    })
    const firstTarget = createTarget('first-player', 'A')
    const secondTarget = createTarget('second-player', 'B')

    const result = simulator.advance(
      FIXED_STEP,
      [firstTarget, secondTarget],
      [createIntent('second-player'), createIntent('first-player')],
    )

    expect(result.events.map((event) => event.type)).toEqual([
      'PLAYER_CONTACT',
      'PLAYER_CONTACT',
      'PLAYER_CONTACT_RESPONSE',
    ])
    expect(result.events[0]).toMatchObject({ playerId: 'first-player' })
    expect(result.events[1]).toMatchObject({ playerId: 'second-player' })
    expect(result.events[2]).toMatchObject({
      playerId: 'first-player',
      outgoingVelocity: {
        z: PLAYER_CONTACT_RESPONSE_CONFIG.forwardVelocity,
      },
    })
  })

  it('keeps ground contact terminal even with overlap and hitPressed at impact', () => {
    const simulator = new FixedStepVolleyballSimulator({
      position: { x: 0, y: 0.11, z: 0 },
      velocity: { x: 0, y: -1, z: 0 },
    })

    const result = simulator.advance(
      FIXED_STEP,
      [createTarget('ground-player', 'B')],
      [createIntent('ground-player')],
    )

    expect(result.events.map((event) => event.type)).toEqual([
      'PLAYER_CONTACT',
      'GROUND_CONTACT',
    ])
    expect(simulator.getState().position.y).toBe(VOLLEYBALL_CONFIG.radius)
    expect(simulator.getState().velocity.y).toBeLessThan(0)
  })

  it('runs the no-hit preview through Team B contact to an IN side-B landing', () => {
    const simulator = new FixedStepVolleyballSimulator(
      createPreviewVolleyballState(),
    )
    const teamBTarget = createTarget('player-b', 'B', 4.5)
    const observedEvents: BallSimulationEvent[] = []

    for (let frame = 0; frame < 180; frame += 1) {
      const result = simulator.advance(1 / 60, [teamBTarget])
      observedEvents.push(...result.events)

      if (result.events.some((event) => event.type === 'GROUND_CONTACT')) {
        break
      }
    }

    expect(observedEvents.map((event) => event.type)).toEqual([
      'PLAYER_CONTACT',
      'GROUND_CONTACT',
    ])
    expect(observedEvents[0]).toMatchObject({
      playerId: 'player-b',
      teamSide: 'B',
    })
    expect(observedEvents[1]).toMatchObject({
      type: 'GROUND_CONTACT',
      courtResult: 'IN',
      courtSide: 'B',
    })
  })

  it('runs a hit after Team B contact through response to an IN side-A landing', () => {
    const simulator = new FixedStepVolleyballSimulator(
      createPreviewVolleyballState(),
    )
    const targets = [
      createTarget('player-a', 'A', -4.5),
      createTarget('player-b', 'B', 4.5),
    ]
    const observedEvents: BallSimulationEvent[] = []
    let hitOnNextFrame = false

    for (let frame = 0; frame < 300; frame += 1) {
      const intents = hitOnNextFrame ? [createIntent('player-b')] : []
      const result = simulator.advance(1 / 60, targets, intents)
      observedEvents.push(...result.events)

      hitOnNextFrame = result.events.some(
        (event) => event.type === 'PLAYER_CONTACT',
      )

      if (result.events.some((event) => event.type === 'GROUND_CONTACT')) {
        break
      }
    }

    expect(observedEvents.map((event) => event.type)).toEqual([
      'PLAYER_CONTACT',
      'PLAYER_CONTACT_RESPONSE',
      'GROUND_CONTACT',
    ])
    expect(observedEvents[1]).toMatchObject({
      type: 'PLAYER_CONTACT_RESPONSE',
      playerId: 'player-b',
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
    expect(
      observedEvents.some(
        (event) =>
          event.type === 'PLAYER_CONTACT_RESPONSE' &&
          event.playerId === 'player-a',
      ),
    ).toBe(false)
  })
})
