import { INDOOR_COURT } from '@/game/court/indoorCourtDimensions'
import type { BallVector3 } from '@/game/ball/volleyballState'

export const INDOOR_BALL_SPAWN: Readonly<BallVector3> = {
  x: 0,
  y: 3,
  z: -INDOOR_COURT.attackLineDistance,
}
