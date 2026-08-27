import { LOCAL_INPUT_CONFIG } from '@/game/input/inputConfig'
import { applyRadialDeadzone } from '@/game/input/inputMath'
import type { InputSourceState } from '@/game/input/inputTypes'

export type GamepadList = ArrayLike<Gamepad | null>
export type GamepadProvider = () => GamepadList

const NEUTRAL_GAMEPAD_STATE: InputSourceState = {
  connected: false,
  deviceName: 'Gamepad',
  localMove: { lateral: 0, forward: 0 },
  jumpHeld: false,
}

export function getNativeGamepads(): GamepadList {
  if (
    typeof navigator === 'undefined' ||
    typeof navigator.getGamepads !== 'function'
  ) {
    return []
  }

  return navigator.getGamepads()
}

function getGamepadAtLogicalSlot(
  gamepads: GamepadList,
  logicalSlot: number,
): Gamepad | null {
  let connectedSlot = 0

  for (let index = 0; index < gamepads.length; index += 1) {
    const gamepad = gamepads[index]

    if (!gamepad?.connected) {
      continue
    }

    if (connectedSlot === logicalSlot) {
      return gamepad
    }

    connectedSlot += 1
  }

  return null
}

export class GamepadInputSource {
  private readonly logicalSlot: number

  constructor(logicalSlot: number) {
    this.logicalSlot = logicalSlot
  }

  read(gamepads: GamepadList): InputSourceState {
    const gamepad = getGamepadAtLogicalSlot(gamepads, this.logicalSlot)

    if (!gamepad) {
      return NEUTRAL_GAMEPAD_STATE
    }

    const lateral = gamepad.axes[0] ?? 0
    const forward = -(gamepad.axes[1] ?? 0)
    const primaryButton = gamepad.buttons[0]

    return {
      connected: true,
      deviceName: gamepad.id || `Gamepad ${this.logicalSlot + 1}`,
      localMove: applyRadialDeadzone(
        { lateral, forward },
        LOCAL_INPUT_CONFIG.gamepadDeadzone,
      ),
      jumpHeld: Boolean(primaryButton?.pressed || (primaryButton?.value ?? 0) > 0.5),
    }
  }
}
