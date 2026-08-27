import { describe, expect, it } from 'vitest'
import { PLAYER_JUMP_CONFIG } from '@/game/movement/playerJumpConfig'
import {
  getJumpInitialVelocity,
  getNextVerticalState,
  type VerticalMovementState,
} from '@/game/movement/playerJumpMath'

function simulateTrajectory(
  frameCount: number,
  deltaSeconds: number,
): VerticalMovementState {
  let state: VerticalMovementState = {
    y: PLAYER_JUMP_CONFIG.groundY,
    verticalVelocity: getJumpInitialVelocity(),
    grounded: false,
  }

  for (let frame = 0; frame < frameCount; frame += 1) {
    state = getNextVerticalState(state, deltaSeconds)
  }

  return state
}

describe('player jump math', () => {
  it('derives the initial velocity from gravity and jump height', () => {
    expect(getJumpInitialVelocity()).toBeCloseTo(4.084, 3)
  })

  it('produces the configured theoretical jump height', () => {
    const velocity = getJumpInitialVelocity()
    const theoreticalHeight =
      velocity ** 2 / (2 * PLAYER_JUMP_CONFIG.gravity)

    expect(theoreticalHeight).toBeCloseTo(PLAYER_JUMP_CONFIG.jumpHeight)
  })

  it('integrates upward motion under constant gravity', () => {
    const initialVelocity = getJumpInitialVelocity()
    const state = getNextVerticalState(
      {
        y: PLAYER_JUMP_CONFIG.groundY,
        verticalVelocity: initialVelocity,
        grounded: false,
      },
      0.05,
    )

    expect(state.y).toBeGreaterThan(PLAYER_JUMP_CONFIG.groundY)
    expect(state.verticalVelocity).toBeCloseTo(
      initialVelocity - PLAYER_JUMP_CONFIG.gravity * 0.05,
    )
    expect(state.grounded).toBe(false)
  })

  it('does not integrate displacement for a zero delta', () => {
    const state: VerticalMovementState = {
      y: PLAYER_JUMP_CONFIG.groundY,
      verticalVelocity: getJumpInitialVelocity(),
      grounded: false,
    }

    expect(getNextVerticalState(state, 0)).toEqual(state)
  })

  it('clamps a descending trajectory to the ground', () => {
    const state = getNextVerticalState(
      { y: 0.05, verticalVelocity: -2, grounded: false },
      0.05,
    )

    expect(state).toEqual({
      y: PLAYER_JUMP_CONFIG.groundY,
      verticalVelocity: 0,
      grounded: true,
    })
  })

  it('produces equivalent pre-landing states at 30 and 60 FPS', () => {
    const thirtyFps = simulateTrajectory(12, 1 / 30)
    const sixtyFps = simulateTrajectory(24, 1 / 60)

    expect(thirtyFps.grounded).toBe(false)
    expect(sixtyFps.grounded).toBe(false)
    expect(thirtyFps.y).toBeCloseTo(sixtyFps.y)
    expect(thirtyFps.verticalVelocity).toBeCloseTo(
      sixtyFps.verticalVelocity,
    )
  })
})
