export const GAMEPLAY_CAMERA_CONFIG = {
  x: 0,
  height: 16,
  distanceFromCentre: 18,
  target: {
    x: 0,
    y: 1,
    z: 0,
  },
  fov: Math.PI / 3,
  minZ: 0.1,
  maxZ: 100,
} as const
