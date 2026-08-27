const height = 1.8
const radius = 0.28

export const PLACEHOLDER_PLAYER = {
  height,
  radius,
  bodyCenterY: height / 2,
  facingMarker: {
    width: 0.16,
    height: 0.24,
    depth: 0.06,
    centerY: height * 0.65,
    centerZ: radius + 0.03,
  },
} as const
