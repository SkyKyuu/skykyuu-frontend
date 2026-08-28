import type { VolleyballState } from '@/game/ball/volleyballState'
import { VOLLEYBALL_SIMULATION_CONFIG } from '@/game/ball/volleyballSimulationConfig'

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
