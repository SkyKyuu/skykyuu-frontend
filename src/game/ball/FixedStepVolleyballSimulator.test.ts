import { describe, expect, it } from 'vitest'
import { FixedStepVolleyballSimulator } from '@/game/ball/FixedStepVolleyballSimulator'
import {
  createPreviewVolleyballState,
  PREVIEW_BALL_LAUNCH_VELOCITY,
} from '@/game/ball/previewVolleyballState'
import { INDOOR_BALL_SPAWN } from '@/game/ball/indoorBallSpawn'
import { VOLLEYBALL_CONFIG } from '@/game/ball/volleyballConfig'
import { VOLLEYBALL_SIMULATION_CONFIG } from '@/game/ball/volleyballSimulationConfig'

function runForOneSecond(renderRate: number) {
  const simulator = new FixedStepVolleyballSimulator(
    createPreviewVolleyballState(),
  )

  for (let frame = 0; frame < renderRate; frame += 1) {
    simulator.advance(1 / renderRate)
  }

  return simulator
}

describe('FixedStepVolleyballSimulator', () => {
  it('normally executes two fixed steps for a 30 FPS render frame', () => {
    const simulator = new FixedStepVolleyballSimulator(
      createPreviewVolleyballState(),
    )

    expect(simulator.advance(1 / 30).executedSteps).toBe(2)
  })

  it('alternates zero and one fixed step at 120 FPS', () => {
    const simulator = new FixedStepVolleyballSimulator(
      createPreviewVolleyballState(),
    )

    expect([
      simulator.advance(1 / 120).executedSteps,
      simulator.advance(1 / 120).executedSteps,
      simulator.advance(1 / 120).executedSteps,
      simulator.advance(1 / 120).executedSteps,
    ]).toEqual([0, 1, 0, 1])
  })

  it('produces the same authoritative state at 30, 60, and 120 FPS', () => {
    const at30Fps = runForOneSecond(30)
    const at60Fps = runForOneSecond(60)
    const at120Fps = runForOneSecond(120)
    const referenceState = at60Fps.getState()

    for (const simulator of [at30Fps, at120Fps]) {
      expect(simulator.totalSimulationSteps).toBe(60)
      expect(simulator.getState().position.x).toBeCloseTo(
        referenceState.position.x,
      )
      expect(simulator.getState().position.y).toBeCloseTo(
        referenceState.position.y,
      )
      expect(simulator.getState().position.z).toBeCloseTo(
        referenceState.position.z,
      )
      expect(simulator.getState().velocity.y).toBeCloseTo(
        referenceState.velocity.y,
      )
    }
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'ignores an invalid frame delta (%s)',
    (frameDeltaSeconds) => {
      const initialState = createPreviewVolleyballState()
      const simulator = new FixedStepVolleyballSimulator(initialState)

      expect(simulator.advance(frameDeltaSeconds)).toEqual({
        executedSteps: 0,
        events: [],
      })
      expect(simulator.getState()).toEqual(initialState)
      expect(simulator.accumulatorSeconds).toBe(0)
      expect(simulator.totalSimulationSteps).toBe(0)
    },
  )

  it('caps a very large frame delta at 0.1 seconds', () => {
    const simulator = new FixedStepVolleyballSimulator(
      createPreviewVolleyballState(),
    )

    expect(simulator.advance(10).executedSteps).toBe(6)
    expect(simulator.totalSimulationSteps).toBe(6)
  })

  it('never exceeds the configured maximum substeps in one advance', () => {
    const simulator = new FixedStepVolleyballSimulator(
      createPreviewVolleyballState(),
    )

    expect(simulator.advance(1_000).executedSteps).toBeLessThanOrEqual(
      VOLLEYBALL_SIMULATION_CONFIG.maxSubSteps,
    )
  })

  it('reset copies the replacement state and clears timing state', () => {
    const simulator = new FixedStepVolleyballSimulator(
      createPreviewVolleyballState(),
    )
    simulator.advance(1 / 120)
    const replacementState = {
      position: { x: 1, y: 2, z: 3 },
      velocity: { x: 4, y: 5, z: 6 },
    }

    simulator.reset(replacementState)
    replacementState.position.x = 99
    replacementState.velocity.y = 99

    expect(simulator.getState()).toEqual({
      position: { x: 1, y: 2, z: 3 },
      velocity: { x: 4, y: 5, z: 6 },
    })
    expect(simulator.accumulatorSeconds).toBe(0)
    expect(simulator.totalSimulationSteps).toBe(0)
  })

  it('returns state copies that cannot mutate the simulator', () => {
    const simulator = new FixedStepVolleyballSimulator(
      createPreviewVolleyballState(),
    )
    const exposedState = simulator.getState()

    exposedState.position.y = 99

    expect(simulator.getState().position.y).toBe(INDOOR_BALL_SPAWN.y)
  })
})

describe('preview volleyball lifecycle', () => {
  it('creates independent preview position and velocity copies', () => {
    const firstState = createPreviewVolleyballState()
    const secondState = createPreviewVolleyballState()

    expect(firstState).toEqual({
      position: INDOOR_BALL_SPAWN,
      velocity: PREVIEW_BALL_LAUNCH_VELOCITY,
    })

    firstState.position.x = 99
    firstState.velocity.z = 99

    expect(secondState.position).toEqual(INDOOR_BALL_SPAWN)
    expect(secondState.velocity).toEqual(PREVIEW_BALL_LAUNCH_VELOCITY)
    expect(firstState.position).not.toBe(INDOOR_BALL_SPAWN)
    expect(firstState.velocity).not.toBe(PREVIEW_BALL_LAUNCH_VELOCITY)
  })

  it('emits one landing event, keeps the impact state, and waits for reset', () => {
    const simulator = new FixedStepVolleyballSimulator({
      position: { x: 0, y: 0.11, z: 1 },
      velocity: { x: 0, y: -1, z: 2 },
    })

    const result = simulator.advance(VOLLEYBALL_SIMULATION_CONFIG.fixedStepSeconds)

    expect(result.events).toHaveLength(1)
    expect(result.events[0]).toMatchObject({
      type: 'GROUND_CONTACT',
      courtResult: 'IN',
      courtSide: 'B',
      position: { x: 0, y: VOLLEYBALL_CONFIG.radius },
    })
    const groundContact = result.events[0]

    expect(groundContact?.type).toBe('GROUND_CONTACT')

    if (groundContact?.type !== 'GROUND_CONTACT') {
      throw new Error('Expected a ground contact event')
    }

    expect(groundContact.velocity.y).toBeLessThan(0)
    expect(simulator.getState().position.y).toBe(VOLLEYBALL_CONFIG.radius)
    expect(simulator.advance(1)).toEqual({ executedSteps: 0, events: [] })

    simulator.reset(createPreviewVolleyballState())
    expect(simulator.advance(1 / 60).events).toEqual([])
  })

  it('lands the preview trajectory inside side B through simulation math', () => {
    const simulator = new FixedStepVolleyballSimulator(
      createPreviewVolleyballState(),
    )
    let landingEvent: ReturnType<
      FixedStepVolleyballSimulator['advance']
    >['events'][number] | null = null

    for (let frame = 0; frame < 180 && !landingEvent; frame += 1) {
      const result = simulator.advance(1 / 60)
      landingEvent = result.events[0] ?? null
    }

    expect(landingEvent).toMatchObject({
      type: 'GROUND_CONTACT',
      courtResult: 'IN',
      courtSide: 'B',
      position: { x: 0, y: VOLLEYBALL_CONFIG.radius },
    })

    if (landingEvent?.type !== 'GROUND_CONTACT') {
      throw new Error('Expected the preview to end with ground contact')
    }

    expect(landingEvent.position.z).toBeGreaterThan(0)
  })
})
