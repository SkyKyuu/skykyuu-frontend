import { INDOOR_BALL_SPAWN } from '@/game/ball/indoorBallSpawn'
import type {
  BallVector3,
  VolleyballState,
} from '@/game/ball/volleyballState'

export const PREVIEW_BALL_LAUNCH_VELOCITY: Readonly<BallVector3> = {
  x: 0,
  y: 4.5,
  z: 6,
}

export function createPreviewVolleyballState(): VolleyballState {
  return {
    position: {
      x: INDOOR_BALL_SPAWN.x,
      y: INDOOR_BALL_SPAWN.y,
      z: INDOOR_BALL_SPAWN.z,
    },
    velocity: {
      x: PREVIEW_BALL_LAUNCH_VELOCITY.x,
      y: PREVIEW_BALL_LAUNCH_VELOCITY.y,
      z: PREVIEW_BALL_LAUNCH_VELOCITY.z,
    },
  }
}
