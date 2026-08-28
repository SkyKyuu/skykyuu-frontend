import { VOLLEYBALL_CONFIG } from '@/game/ball/volleyballConfig'
import type { VolleyballState } from '@/game/ball/volleyballState'
import { VOLLEYBALL_SIMULATION_CONFIG } from '@/game/ball/volleyballSimulationConfig'

const CONTACT_TIME_EPSILON = 1e-12

export function findGroundContactTime(
  state: VolleyballState,
  maximumDeltaSeconds: number,
): number | null {
  if (!Number.isFinite(maximumDeltaSeconds) || maximumDeltaSeconds < 0) {
    return null
  }

  const { gravity } = VOLLEYBALL_SIMULATION_CONFIG
  const heightAboveGround = state.position.y - VOLLEYBALL_CONFIG.radius
  const discriminant =
    state.velocity.y ** 2 + 2 * gravity * heightAboveGround

  if (discriminant < 0) {
    return null
  }

  const squareRoot = Math.sqrt(discriminant)
  const candidates = [
    (state.velocity.y - squareRoot) / gravity,
    (state.velocity.y + squareRoot) / gravity,
  ]

  for (const candidate of candidates) {
    const impactVelocityY = state.velocity.y - gravity * candidate

    if (
      candidate >= -CONTACT_TIME_EPSILON &&
      candidate <= maximumDeltaSeconds + CONTACT_TIME_EPSILON &&
      impactVelocityY <= CONTACT_TIME_EPSILON
    ) {
      return Math.min(maximumDeltaSeconds, Math.max(0, candidate))
    }
  }

  return null
}

export function stepVolleyballFreeFlight(
  state: VolleyballState,
  deltaSeconds: number,
): VolleyballState {
  const { gravity } = VOLLEYBALL_SIMULATION_CONFIG

  return {
    position: {
      x: state.position.x + state.velocity.x * deltaSeconds,
      y:
        state.position.y +
        state.velocity.y * deltaSeconds -
        0.5 * gravity * deltaSeconds ** 2,
      z: state.position.z + state.velocity.z * deltaSeconds,
    },
    velocity: {
      x: state.velocity.x,
      y: state.velocity.y - gravity * deltaSeconds,
      z: state.velocity.z,
    },
  }
}
