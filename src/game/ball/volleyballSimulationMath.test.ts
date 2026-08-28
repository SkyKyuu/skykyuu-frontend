import { describe, expect, it } from 'vitest'
import { createPreviewVolleyballState } from '@/game/ball/previewVolleyballState'
import { VOLLEYBALL_SIMULATION_CONFIG } from '@/game/ball/volleyballSimulationConfig'
import { stepVolleyballFreeFlight } from '@/game/ball/volleyballSimulationMath'

describe('stepVolleyballFreeFlight', () => {
  it('integrates one known gravity step', () => {
    const state = createPreviewVolleyballState()
    const deltaSeconds = VOLLEYBALL_SIMULATION_CONFIG.fixedStepSeconds
    const nextState = stepVolleyballFreeFlight(state, deltaSeconds)

    expect(nextState.position.x).toBeCloseTo(0)
    expect(nextState.position.y).toBeCloseTo(
      3 + 3 * deltaSeconds - 0.5 * 9.81 * deltaSeconds ** 2,
    )
    expect(nextState.position.z).toBeCloseTo(-3 + 6 * deltaSeconds)
    expect(nextState.velocity).toEqual({
      x: 0,
      y: 3 - 9.81 * deltaSeconds,
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

    expect(nextState.velocity.y).toBeCloseTo(3 - 9.81 * 0.2)
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

  it('matches the ballistic equation after 60 fixed steps', () => {
    let state = createPreviewVolleyballState()

    for (let step = 0; step < 60; step += 1) {
      state = stepVolleyballFreeFlight(
        state,
        VOLLEYBALL_SIMULATION_CONFIG.fixedStepSeconds,
      )
    }

    expect(state.position.x).toBeCloseTo(0)
    expect(state.position.y).toBeCloseTo(3 + 3 - 0.5 * 9.81)
    expect(state.position.z).toBeCloseTo(-3 + 6)
    expect(state.velocity.y).toBeCloseTo(3 - 9.81)
  })
})
