import { describe, expect, it } from 'vitest'
import {
  createPreviewVolleyballState,
  PREVIEW_BALL_LAUNCH_VELOCITY,
} from '@/game/ball/previewVolleyballState'
import { VOLLEYBALL_CONFIG } from '@/game/ball/volleyballConfig'
import { VOLLEYBALL_SIMULATION_CONFIG } from '@/game/ball/volleyballSimulationConfig'
import {
  findGroundContactTime,
  stepVolleyballFreeFlight,
} from '@/game/ball/volleyballSimulationMath'

describe('stepVolleyballFreeFlight', () => {
  it('integrates one known gravity step', () => {
    const state = createPreviewVolleyballState()
    const deltaSeconds = VOLLEYBALL_SIMULATION_CONFIG.fixedStepSeconds
    const nextState = stepVolleyballFreeFlight(state, deltaSeconds)

    expect(nextState.position.x).toBeCloseTo(0)
    expect(nextState.position.y).toBeCloseTo(
      3 +
        PREVIEW_BALL_LAUNCH_VELOCITY.y * deltaSeconds -
        0.5 * 9.81 * deltaSeconds ** 2,
    )
    expect(nextState.position.z).toBeCloseTo(-3 + 6 * deltaSeconds)
    expect(nextState.velocity).toEqual({
      x: 0,
      y: PREVIEW_BALL_LAUNCH_VELOCITY.y - 9.81 * deltaSeconds,
      z: 6,
    })
  })

  it('keeps horizontal velocity constant without other forces', () => {
    const state = createPreviewVolleyballState()
    state.velocity.x = 1.25

    const nextState = stepVolleyballFreeFlight(state, 0.25)

    expect(nextState.velocity.x).toBe(1.25)
    expect(nextState.velocity.z).toBe(6)
  })

  it('subtracts gravity from vertical velocity', () => {
    const state = createPreviewVolleyballState()
    const nextState = stepVolleyballFreeFlight(state, 0.2)

    expect(nextState.velocity.y).toBeCloseTo(
      PREVIEW_BALL_LAUNCH_VELOCITY.y - 9.81 * 0.2,
    )
  })

  it('returns a new state without mutating the input', () => {
    const state = createPreviewVolleyballState()
    const originalState = structuredClone(state)
    const nextState = stepVolleyballFreeFlight(state, 1 / 60)

    expect(state).toEqual(originalState)
    expect(nextState).not.toBe(state)
    expect(nextState.position).not.toBe(state.position)
    expect(nextState.velocity).not.toBe(state.velocity)
  })

  it('finds the descending ground contact inside a fixed step', () => {
    const state = {
      position: { x: 2, y: 0.2, z: 3 },
      velocity: { x: 4, y: -1, z: 5 },
    }
    const contactTime = findGroundContactTime(state, 0.1)

    expect(contactTime).not.toBeNull()
    expect(contactTime).toBeGreaterThanOrEqual(0)
    expect(contactTime).toBeLessThanOrEqual(0.1)

    const impactState = stepVolleyballFreeFlight(state, contactTime ?? 0)
    expect(impactState.position.y).toBeCloseTo(VOLLEYBALL_CONFIG.radius)
    expect(impactState.velocity.y).toBeCloseTo(
      state.velocity.y - VOLLEYBALL_SIMULATION_CONFIG.gravity * (contactTime ?? 0),
    )
  })

  it('returns null when the ball stays above the ground during the step', () => {
    const state = {
      position: { x: 0, y: 3, z: 0 },
      velocity: { x: 0, y: 3, z: 0 },
    }

    expect(findGroundContactTime(state, 1 / 60)).toBeNull()
  })

  it('matches the ballistic equation after 60 fixed steps', () => {
    let state = createPreviewVolleyballState()

    for (let step = 0; step < 60; step += 1) {
      state = stepVolleyballFreeFlight(
        state,
        VOLLEYBALL_SIMULATION_CONFIG.fixedStepSeconds,
      )
    }

    expect(state.position.x).toBeCloseTo(0)
    expect(state.position.y).toBeCloseTo(
      3 + PREVIEW_BALL_LAUNCH_VELOCITY.y - 0.5 * 9.81,
    )
    expect(state.position.z).toBeCloseTo(-3 + 6)
    expect(state.velocity.y).toBeCloseTo(
      PREVIEW_BALL_LAUNCH_VELOCITY.y - 9.81,
    )
  })
})
