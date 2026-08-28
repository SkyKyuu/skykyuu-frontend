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
  },
  gamepadButtons: {
    jump: 0,
    hit: 1,
  },
} as const
