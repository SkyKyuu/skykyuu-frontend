import { describe, expect, it } from 'vitest'
import { INDOOR_BALL_SPAWN } from '@/game/ball/indoorBallSpawn'
import { VOLLEYBALL_CONFIG } from '@/game/ball/volleyballConfig'
import { createInitialVolleyballState } from '@/game/ball/volleyballState'
import { INDOOR_COURT } from '@/game/court/indoorCourtDimensions'

describe('volleyball foundation', () => {
  it('uses regulation-scale baseline dimensions and mass', () => {
    expect(VOLLEYBALL_CONFIG.radius).toBe(0.105)
    expect(VOLLEYBALL_CONFIG.diameter).toBe(0.21)
    expect(VOLLEYBALL_CONFIG.diameter).toBe(
      VOLLEYBALL_CONFIG.radius * 2,
    )
    expect(VOLLEYBALL_CONFIG.massKg).toBe(0.27)
  })

  it('derives the indoor preview spawn from the TEAM_A attack line', () => {
    expect(INDOOR_BALL_SPAWN).toEqual({
      x: 0,
      y: 3,
      z: -INDOOR_COURT.attackLineDistance,
    })
  })

  it('creates a stationary initial state at the spawn', () => {
    expect(createInitialVolleyballState(INDOOR_BALL_SPAWN)).toEqual({
      position: INDOOR_BALL_SPAWN,
      velocity: { x: 0, y: 0, z: 0 },
    })
  })

  it('copies the spawn instead of sharing its mutable reference', () => {
    const spawn = { x: 1, y: 2, z: 3 }
    const state = createInitialVolleyballState(spawn)

    state.position.x = 99

    expect(spawn).toEqual({ x: 1, y: 2, z: 3 })
  })
})
