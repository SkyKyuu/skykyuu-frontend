export interface BallVector3 {
  x: number
  y: number
  z: number
}

export interface VolleyballState {
  position: BallVector3
  velocity: BallVector3
}

export function copyVolleyballState(state: VolleyballState): VolleyballState {
  return {
    position: {
      x: state.position.x,
      y: state.position.y,
      z: state.position.z,
    },
    velocity: {
      x: state.velocity.x,
      y: state.velocity.y,
      z: state.velocity.z,
    },
  }
}

export function createInitialVolleyballState(
  spawn: BallVector3,
): VolleyballState {
  return {
    position: {
      x: spawn.x,
      y: spawn.y,
      z: spawn.z,
    },
    velocity: {
      x: 0,
      y: 0,
      z: 0,
    },
  }
}
