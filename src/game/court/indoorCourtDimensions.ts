const width = 9
const length = 18
const attackLineDistance = 3
const lineWidth = 0.05
const freeZone = 3

export const INDOOR_COURT = {
  width,
  length,
  halfWidth: width / 2,
  halfLength: length / 2,
  attackLineDistance,
  lineWidth,
  freeZone,
  totalAreaWidth: width + freeZone * 2,
  totalAreaLength: length + freeZone * 2,
} as const
