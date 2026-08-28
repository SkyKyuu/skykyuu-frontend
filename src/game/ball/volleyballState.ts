export interface BallVector3 {
  x: number
  y: number
  z: number
}

export interface VolleyballState {
  position: BallVector3
  velocity: BallVector3
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
