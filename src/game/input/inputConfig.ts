export const LOCAL_INPUT_CONFIG = {
  maxLocalPlayers: 4,
  gamepadDeadzone: 0.15,
  debugUpdateIntervalMs: 100,
  keyboardCodes: {
    forward: 'KeyW',
    backward: 'KeyS',
    left: 'KeyA',
    right: 'KeyD',
    jump: 'Space',
    hit: 'KeyE',
    forearmPass: 'KeyQ',
    set: 'KeyR',
  },
  gamepadButtons: {
    jump: 0,
    hit: 1,
    set: 2,
    forearmPass: 4,
  },
} as const
