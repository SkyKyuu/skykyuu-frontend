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
    aimLateral = 0,
  }: {
    hitHeld?: boolean
    hitPressed?: boolean
    aimLateral?: number
  } = {},
): PlayerHitIntent {
  return { playerId, hitHeld, hitPressed, aimLateral }
}

function getResponseEvent(events: readonly BallSimulationEvent[]) {
  const response = events.find(
    (event) => event.type === 'PLAYER_CONTACT_RESPONSE',
  )

  if (!response || response.type !== 'PLAYER_CONTACT_RESPONSE') {
    throw new Error('Expected PLAYER_CONTACT_RESPONSE event')
  }

  return response
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
      hitTimingOffsetSteps: 0,
      hitTimingOffsetSeconds: 0,
      hitTimingGrade: 'PERFECT',
      hitTimingForwardMultiplier: 1,
      hitAimLateral: 0,
    })
  })

  it.each([-1, 0, 1, 0.375])(
    'captures direct player-local aim %s without changing PERFECT physics',
    (aimLateral) => {
      const simulator = new FixedStepVolleyballSimulator({
        position: { x: 0, y: 1, z: 0 },
        velocity: { x: 0.25, y: 0.5, z: 0.75 },
      })

      const response = getResponseEvent(
        simulator.advance(
          FIXED_STEP,
          [createTarget('player-b', 'B')],
          [createIntent('player-b', { aimLateral })],
        ).events,
      )

      expect(response).toMatchObject({
        hitTimingOffsetSteps: 0,
        hitTimingGrade: 'PERFECT',
        hitTimingForwardMultiplier: 1,
        hitAimLateral: aimLateral,
        outgoingVelocity: { x: 0.25, y: 6.3, z: -5 },
      })
    },
  )

  it.each([-1, 1])(
    'keeps EARLY timing power unchanged for player-local aim %s',
    (aimLateral) => {
      const initialState = {
        position: { x: 0, y: 1, z: 0 },
        velocity: { x: 0.25, y: 0.5, z: 0.75 },
      }
      const simulator = new FixedStepVolleyballSimulator(initialState)
      const nearTarget = createTarget('player-b', 'B')
      const farTarget = {
        ...nearTarget,
        position: { x: 10, y: 0, z: 0 },
      }

      simulator.advance(FIXED_STEP, [farTarget], [
        createIntent('player-b', { aimLateral }),
      ])
      const response = getResponseEvent(
        simulator.advance(FIXED_STEP, [nearTarget]).events,
      )

      expect(response).toMatchObject({
        hitTimingOffsetSteps: -1,
        hitTimingGrade: 'EARLY',
        hitTimingForwardMultiplier: 0.9,
        hitAimLateral: aimLateral,
        outgoingVelocity: { x: 0.25, y: 6.3, z: -4.5 },
      })
    },
  )

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

  it('does not rearm an expiring buffer from hitHeld alone', () => {
    const simulator = new FixedStepVolleyballSimulator({
      position: { x: 0, y: 1, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
    })
    const nearTarget = createTarget('player-b', 'B')
    const farTarget = {
      ...nearTarget,
      position: { x: 10, y: 0, z: 0 },
    }
    const heldOnly = createIntent('player-b', {
      hitHeld: true,
      hitPressed: false,
      aimLateral: 1,
    })

    simulator.advance(FIXED_STEP, [farTarget], [
      createIntent('player-b', { aimLateral: -1 }),
    ])

    for (let step = 0; step < 5; step += 1) {
      simulator.advance(FIXED_STEP, [farTarget], [heldOnly])
    }

    const result = simulator.advance(FIXED_STEP, [nearTarget], [heldOnly])

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
        z: -4.5,
      },
      hitTimingOffsetSteps: 1,
      hitTimingOffsetSeconds: FIXED_STEP,
      hitTimingGrade: 'LATE',
      hitTimingForwardMultiplier: 0.9,
      hitAimLateral: 0,
    })
  })

  it('consumes a buffered hit so it cannot respond again after re-entry', () => {
    const simulator = new FixedStepVolleyballSimulator({
      position: { x: 0, y: 1, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
    })
    const nearTarget = createTarget('player-b', 'B')
    const farTarget = {
      ...nearTarget,
      position: { x: 10, y: 0, z: 0 },
    }

    simulator.advance(
      FIXED_STEP,
      [farTarget],
      [createIntent('player-b')],
    )
    const secondResponse = simulator.advance(FIXED_STEP, [nearTarget])

    expect(secondResponse.events.map((event) => event.type)).toEqual([
      'PLAYER_CONTACT',
      'PLAYER_CONTACT_RESPONSE',
    ])
    expect(getResponseEvent(secondResponse.events)).toMatchObject({
      hitTimingOffsetSteps: -1,
      hitTimingOffsetSeconds: -FIXED_STEP,
      hitTimingGrade: 'EARLY',
      hitTimingForwardMultiplier: 0.9,
    })

    simulator.advance(FIXED_STEP, [farTarget])

    expect(
      simulator.advance(FIXED_STEP, [nearTarget]).events.map(
        (event) => event.type,
      ),
    ).toEqual(['PLAYER_CONTACT'])
  })

  it('discards a second hit pressed during the same responded overlap', () => {
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
        [nearTarget],
        [createIntent('player-b', { aimLateral: -1 })],
      ).events,
    ).toHaveLength(2)
    expect(
      simulator.advance(
        FIXED_STEP,
        [nearTarget],
        [createIntent('player-b', { aimLateral: 1 })],
      ).events,
    ).toEqual([])

    simulator.advance(FIXED_STEP, [farTarget])

    expect(
      simulator.advance(FIXED_STEP, [nearTarget]).events.map(
        (event) => event.type,
      ),
    ).toEqual(['PLAYER_CONTACT'])
  })

  it('discards a same-overlap hit when its advance executes no fixed step', () => {
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
        [nearTarget],
        [createIntent('player-b', { aimLateral: -1 })],
      ).events.map((event) => event.type),
    ).toEqual(['PLAYER_CONTACT', 'PLAYER_CONTACT_RESPONSE'])

    expect(
      simulator.advance(
        FIXED_STEP / 2,
        [nearTarget],
        [createIntent('player-b', { aimLateral: 1 })],
      ),
    ).toEqual({ executedSteps: 0, events: [] })

    expect(simulator.advance(FIXED_STEP / 2, [farTarget])).toEqual({
      executedSteps: 1,
      events: [],
    })

    expect(
      simulator.advance(FIXED_STEP, [nearTarget]).events.map(
        (event) => event.type,
      ),
    ).toEqual(['PLAYER_CONTACT'])
  })

  it('allows another response from a new hit after an observed leave', () => {
    const simulator = new FixedStepVolleyballSimulator({
      position: { x: 0, y: 1, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
    })
    const nearTarget = createTarget('player-b', 'B')
    const farTarget = {
      ...nearTarget,
      position: { x: 10, y: 0, z: 0 },
    }
    const firstIntent = createIntent('player-b', { aimLateral: -1 })
    const nextIntent = createIntent('player-b', { aimLateral: 0.5 })

    expect(
      simulator.advance(FIXED_STEP, [nearTarget], [firstIntent]).events,
    ).toHaveLength(2)
    expect(simulator.advance(FIXED_STEP, [farTarget]).events).toEqual([])
    expect(
      simulator.advance(FIXED_STEP, [farTarget], [nextIntent]).events,
    ).toEqual([])
    const reentryResponse = simulator.advance(FIXED_STEP, [nearTarget])

    expect(reentryResponse.events.map((event) => event.type)).toEqual([
      'PLAYER_CONTACT',
      'PLAYER_CONTACT_RESPONSE',
    ])
    expect(getResponseEvent(reentryResponse.events)).toMatchObject({
      hitTimingOffsetSteps: -1,
      hitTimingOffsetSeconds: -FIXED_STEP,
      hitTimingGrade: 'EARLY',
      hitTimingForwardMultiplier: 0.9,
      hitAimLateral: 0.5,
    })
  })

  it('buffers a hit pressed one fixed step before overlap', () => {
    const initialState = {
      position: { x: 0, y: 1, z: 0 },
      velocity: { x: 0.25, y: 0.5, z: 0.75 },
    }
    const simulator = new FixedStepVolleyballSimulator(initialState)
    const nearTarget = createTarget('player-b', 'B')
    const farTarget = {
      ...nearTarget,
      position: { x: 10, y: 0, z: 0 },
    }

    expect(
      simulator.advance(
        FIXED_STEP,
        [farTarget],
        [createIntent('player-b', { aimLateral: -0.75 })],
      ).events,
    ).toEqual([])
    const responseResult = simulator.advance(FIXED_STEP, [nearTarget])
    const expectedIncomingState = stepVolleyballFreeFlight(
      stepVolleyballFreeFlight(initialState, FIXED_STEP),
      FIXED_STEP,
    )

    expect(responseResult.events.map((event) => event.type)).toEqual([
      'PLAYER_CONTACT',
      'PLAYER_CONTACT_RESPONSE',
    ])
    expect(responseResult.events[1]).toMatchObject({
      ballPosition: expectedIncomingState.position,
      incomingVelocity: expectedIncomingState.velocity,
      hitTimingOffsetSteps: -1,
      hitTimingOffsetSeconds: -FIXED_STEP,
      hitTimingGrade: 'EARLY',
      hitTimingForwardMultiplier: 0.9,
      hitAimLateral: -0.75,
    })
  })

  it('re-presses before contact to replace both timing and latched aim', () => {
    const simulator = new FixedStepVolleyballSimulator({
      position: { x: 0, y: 1, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
    })
    const nearTarget = createTarget('player-b', 'B')
    const farTarget = {
      ...nearTarget,
      position: { x: 10, y: 0, z: 0 },
    }

    simulator.advance(FIXED_STEP, [farTarget], [
      createIntent('player-b', { aimLateral: -1 }),
    ])
    simulator.advance(FIXED_STEP, [farTarget], [
      createIntent('player-b', {
        hitHeld: false,
        hitPressed: false,
        aimLateral: 0,
      }),
    ])
    simulator.advance(FIXED_STEP, [farTarget], [
      createIntent('player-b', { aimLateral: 1 }),
    ])

    const response = getResponseEvent(
      simulator.advance(FIXED_STEP, [nearTarget]).events,
    )

    expect(response).toMatchObject({
      hitTimingOffsetSteps: -1,
      hitTimingOffsetSeconds: -FIXED_STEP,
      hitAimLateral: 1,
    })
  })

  it('throws a player-specific invariant error when eligible aim is missing', () => {
    const simulator = new FixedStepVolleyballSimulator({
      position: { x: 0, y: 1, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
    })
    const nearTarget = createTarget('player-b', 'B')
    const farTarget = {
      ...nearTarget,
      position: { x: 10, y: 0, z: 0 },
    }

    simulator.advance(0, [farTarget], [
      createIntent('player-b', { aimLateral: -1 }),
    ])
    const internalAimState = simulator as unknown as {
      hitAimLateralByPlayer: Map<string, number>
    }
    internalAimState.hitAimLateralByPlayer.delete('player-b')

    expect(() => simulator.advance(FIXED_STEP, [nearTarget])).toThrow(
      'Missing hit aim lateral for eligible player: player-b',
    )
  })

  it('keeps a buffered hit active across several fixed steps inside the window', () => {
    const simulator = new FixedStepVolleyballSimulator({
      position: { x: 0, y: 1, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
    })
    const nearTarget = createTarget('player-b', 'B')
    const farTarget = {
      ...nearTarget,
      position: { x: 10, y: 0, z: 0 },
    }

    const heldOnlyWithChangedAim = createIntent('player-b', {
      hitHeld: true,
      hitPressed: false,
      aimLateral: 1,
    })

    simulator.advance(
      FIXED_STEP,
      [farTarget],
      [createIntent('player-b', { aimLateral: -1 })],
    )
    simulator.advance(FIXED_STEP, [farTarget], [heldOnlyWithChangedAim])
    simulator.advance(FIXED_STEP, [farTarget], [heldOnlyWithChangedAim])

    const responseResult = simulator.advance(
      FIXED_STEP,
      [nearTarget],
      [heldOnlyWithChangedAim],
    )

    expect(responseResult.events.map((event) => event.type)).toEqual([
      'PLAYER_CONTACT',
      'PLAYER_CONTACT_RESPONSE',
    ])
    expect(responseResult.events[1]).toMatchObject({
      hitTimingOffsetSteps: -3,
      hitTimingOffsetSeconds: -3 * FIXED_STEP,
      hitTimingGrade: 'EARLY',
      hitTimingForwardMultiplier: 0.9,
      hitAimLateral: -1,
    })
  })

  it('accepts overlap on the sixth fixed step at the deterministic limit', () => {
    const simulator = new FixedStepVolleyballSimulator({
      position: { x: 0, y: 1, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
    })
    const nearTarget = createTarget('player-b', 'B')
    const farTarget = {
      ...nearTarget,
      position: { x: 10, y: 0, z: 0 },
    }

    simulator.advance(
      FIXED_STEP,
      [farTarget],
      [createIntent('player-b')],
    )

    // After five executed 60 Hz steps, the buffer is still positive at the
    // start of step six. It decays only after this response opportunity.
    for (let step = 0; step < 4; step += 1) {
      simulator.advance(FIXED_STEP, [farTarget])
    }

    const responseResult = simulator.advance(FIXED_STEP, [nearTarget])

    expect(responseResult.events.map((event) => event.type)).toEqual([
      'PLAYER_CONTACT',
      'PLAYER_CONTACT_RESPONSE',
    ])
    expect(responseResult.events[1]).toMatchObject({
      hitTimingOffsetSteps: -5,
      hitTimingOffsetSeconds: -5 * FIXED_STEP,
      hitTimingGrade: 'VERY_EARLY',
      hitTimingForwardMultiplier: 0.75,
    })
  })

  it('expires buffered aim and uses only a later new hit aim', () => {
    const simulator = new FixedStepVolleyballSimulator({
      position: { x: 0, y: 1, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
    })
    const nearTarget = createTarget('player-b', 'B')
    const farTarget = {
      ...nearTarget,
      position: { x: 10, y: 0, z: 0 },
    }

    simulator.advance(
      FIXED_STEP,
      [farTarget],
      [createIntent('player-b', { aimLateral: -1 })],
    )

    for (let step = 0; step < 5; step += 1) {
      simulator.advance(FIXED_STEP, [farTarget])
    }

    expect(
      simulator.advance(FIXED_STEP, [nearTarget]).events.map(
        (event) => event.type,
      ),
    ).toEqual(['PLAYER_CONTACT'])

    simulator.advance(FIXED_STEP, [farTarget])
    simulator.advance(FIXED_STEP, [farTarget], [
      createIntent('player-b', { aimLateral: 0.5 }),
    ])
    const newResponse = simulator.advance(FIXED_STEP, [nearTarget])

    expect(getResponseEvent(newResponse.events)).toMatchObject({
      hitTimingOffsetSteps: -1,
      hitAimLateral: 0.5,
    })
  })

  it('does not decay the buffer when accumulated time executes no fixed step', () => {
    const simulator = new FixedStepVolleyballSimulator({
      position: { x: 0, y: 1, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
    })
    const nearTarget = createTarget('player-b', 'B')
    const farTarget = {
      ...nearTarget,
      position: { x: 10, y: 0, z: 0 },
    }

    const armedWithoutStep = simulator.advance(
      FIXED_STEP / 2,
      [farTarget],
      [createIntent('player-b')],
    )
    expect(armedWithoutStep.executedSteps).toBe(0)

    simulator.advance(FIXED_STEP / 2, [farTarget])
    for (let step = 0; step < 4; step += 1) {
      simulator.advance(FIXED_STEP, [farTarget])
    }

    expect(
      simulator.advance(FIXED_STEP, [nearTarget]).events.map(
        (event) => event.type,
      ),
    ).toEqual(['PLAYER_CONTACT', 'PLAYER_CONTACT_RESPONSE'])
  })

  it.each([
    ['zero', 0],
    ['invalid', Number.NaN],
  ])('preserves a hit edge across a %s frame delta', (_label, delta) => {
    const simulator = new FixedStepVolleyballSimulator({
      position: { x: 0, y: 1, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
    })
    const target = createTarget('player-b', 'B')

    expect(
      simulator.advance(delta, [target], [
        createIntent('player-b', { aimLateral: 0.5 }),
      ]),
    ).toEqual({ executedSteps: 0, events: [] })
    const responseResult = simulator.advance(FIXED_STEP, [target])

    expect(responseResult.events.map((event) => event.type)).toEqual([
      'PLAYER_CONTACT',
      'PLAYER_CONTACT_RESPONSE',
    ])
    expect(responseResult.events[1]).toMatchObject({
      hitTimingOffsetSteps: 0,
      hitTimingOffsetSeconds: 0,
      hitTimingGrade: 'PERFECT',
      hitTimingForwardMultiplier: 1,
      hitAimLateral: 0.5,
    })
  })

  it('clears buffered hits on reset', () => {
    const state = {
      position: { x: 0, y: 1, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
    }
    const simulator = new FixedStepVolleyballSimulator(state)
    const target = createTarget('player-b', 'B')

    simulator.advance(0, [target], [
      createIntent('player-b', { aimLateral: 0.75 }),
    ])
    simulator.reset(state)

    expect(
      simulator.advance(FIXED_STEP, [target]).events.map(
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
    const farTargets = [firstTarget, secondTarget].map((target) => ({
      ...target,
      position: { ...target.position, x: 10 },
    }))

    simulator.advance(FIXED_STEP, farTargets, [
      createIntent('second-player', { aimLateral: -0.75 }),
    ])

    const result = simulator.advance(
      FIXED_STEP,
      [firstTarget, secondTarget],
      [createIntent('first-player', { aimLateral: 0.5 })],
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
      hitTimingOffsetSteps: 0,
      hitTimingOffsetSeconds: 0,
      hitTimingGrade: 'PERFECT',
      hitTimingForwardMultiplier: 1,
      hitAimLateral: 0.5,
      outgoingVelocity: {
        z: PLAYER_CONTACT_RESPONSE_CONFIG.forwardVelocity,
      },
    })

    const secondResult = simulator.advance(FIXED_STEP, [
      firstTarget,
      secondTarget,
    ])

    expect(secondResult.events.map((event) => event.type)).toEqual([
      'PLAYER_CONTACT_RESPONSE',
    ])
    expect(getResponseEvent(secondResult.events)).toMatchObject({
      playerId: 'second-player',
      hitTimingOffsetSteps: -1,
      hitTimingOffsetSeconds: -FIXED_STEP,
      hitTimingGrade: 'EARLY',
      hitTimingForwardMultiplier: 0.9,
      hitAimLateral: -0.75,
    })
  })

  it('applies exact forward power across all grades for both teams', () => {
    const initialState = {
      position: { x: 0, y: 1, z: 0 },
      velocity: { x: 0.25, y: 0.5, z: 0.75 },
    }

    function simulateResponse(
      offsetSteps: number,
      teamSide: 'A' | 'B',
    ) {
      const playerId = `player-${teamSide.toLowerCase()}`
      const nearTarget = createTarget(playerId, teamSide)
      const farTarget = {
        ...nearTarget,
        position: { x: 10, y: 0, z: 0 },
      }
      const simulator = new FixedStepVolleyballSimulator(initialState)

      if (offsetSteps < 0) {
        simulator.advance(
          FIXED_STEP,
          [farTarget],
          [createIntent(playerId)],
        )
        for (let step = 1; step < Math.abs(offsetSteps); step += 1) {
          simulator.advance(FIXED_STEP, [farTarget])
        }

        return getResponseEvent(
          simulator.advance(FIXED_STEP, [nearTarget]).events,
        )
      }

      if (offsetSteps === 0) {
        return getResponseEvent(
          simulator.advance(
            FIXED_STEP,
            [nearTarget],
            [createIntent(playerId)],
          ).events,
        )
      }

      simulator.advance(FIXED_STEP, [nearTarget])
      for (let step = 1; step < offsetSteps; step += 1) {
        simulator.advance(FIXED_STEP, [nearTarget])
      }

      return getResponseEvent(
        simulator.advance(
          FIXED_STEP,
          [nearTarget],
          [createIntent(playerId)],
        ).events,
      )
    }

    const offsets = [-4, -1, 0, 1, 4]
    const expectedGrades = [
      'VERY_EARLY',
      'EARLY',
      'PERFECT',
      'LATE',
      'VERY_LATE',
    ]
    const expectedMultipliers = [0.75, 0.9, 1, 0.9, 0.75]
    const teamBResponses = offsets.map((offset) =>
      simulateResponse(offset, 'B'),
    )
    const teamAResponses = offsets.map((offset) =>
      simulateResponse(offset, 'A'),
    )

    expect(
      teamBResponses.map((response) => response.hitTimingOffsetSteps),
    ).toEqual(offsets)
    expect(
      teamBResponses.map((response) => response.hitTimingGrade),
    ).toEqual(expectedGrades)
    expect(
      teamAResponses.map((response) => response.hitTimingGrade),
    ).toEqual(expectedGrades)
    expect(
      teamBResponses.map(
        (response) => response.hitTimingForwardMultiplier,
      ),
    ).toEqual(expectedMultipliers)
    expect(
      teamAResponses.map(
        (response) => response.hitTimingForwardMultiplier,
      ),
    ).toEqual(expectedMultipliers)
    expect(
      [...teamBResponses, ...teamAResponses].map(
        (response) => response.hitAimLateral,
      ),
    ).toEqual([...offsets, ...offsets].map(() => 0))
    expect(
      teamBResponses.map((response) => response.outgoingVelocity),
    ).toEqual([
      { x: 0.25, y: 6.3, z: -3.75 },
      { x: 0.25, y: 6.3, z: -4.5 },
      { x: 0.25, y: 6.3, z: -5 },
      { x: 0.25, y: 6.3, z: -4.5 },
      { x: 0.25, y: 6.3, z: -3.75 },
    ])
    expect(
      teamAResponses.map((response) => response.outgoingVelocity),
    ).toEqual([
      { x: 0.25, y: 6.3, z: 3.75 },
      { x: 0.25, y: 6.3, z: 4.5 },
      { x: 0.25, y: 6.3, z: 5 },
      { x: 0.25, y: 6.3, z: 4.5 },
      { x: 0.25, y: 6.3, z: 3.75 },
    ])
  })

  it('keeps ground contact terminal even with an active buffered hit at impact', () => {
    const simulator = new FixedStepVolleyballSimulator({
      position: { x: 0, y: 0.11, z: 0 },
      velocity: { x: 0, y: -1, z: 0 },
    })
    const target = createTarget('ground-player', 'B')

    simulator.advance(0, [target], [
      createIntent('ground-player', { aimLateral: 0.8 }),
    ])

    const result = simulator.advance(FIXED_STEP, [target])

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

  it('runs a deterministic buffered preview hit through to an IN side-A landing', () => {
    const referenceSimulator = new FixedStepVolleyballSimulator(
      createPreviewVolleyballState(),
    )
    const targets = [
      createTarget('player-a', 'A', -4.5),
      createTarget('player-b', 'B', 4.5),
    ]
    let contactStep = -1

    for (let step = 1; step <= 300; step += 1) {
      const result = referenceSimulator.advance(FIXED_STEP, targets)

      if (result.events.some((event) => event.type === 'PLAYER_CONTACT')) {
        contactStep = step
        break
      }
    }

    expect(contactStep).toBeGreaterThan(3)

    const simulator = new FixedStepVolleyballSimulator(
      createPreviewVolleyballState(),
    )
    const observedEvents: BallSimulationEvent[] = []
    // The press step is derived from the observed contact step. Three 60 Hz
    // fixed steps are 50 ms, safely inside the configured 100 ms window.
    const bufferedHitStep = contactStep - 3

    for (let step = 1; step <= 300; step += 1) {
      const intents =
        step === bufferedHitStep ? [createIntent('player-b')] : []
      const result = simulator.advance(FIXED_STEP, targets, intents)
      observedEvents.push(...result.events)

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
      hitTimingOffsetSteps: -3,
      hitTimingOffsetSeconds: -3 * FIXED_STEP,
      hitTimingGrade: 'EARLY',
      hitTimingForwardMultiplier: 0.9,
      hitAimLateral: 0,
      outgoingVelocity: {
        y: PLAYER_CONTACT_RESPONSE_CONFIG.upwardVelocity,
        z: -4.5,
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
