import { LOCAL_INPUT_CONFIG } from '@/game/input/inputConfig'
import { normalizeMove2D } from '@/game/input/inputMath'
import type { InputSourceState } from '@/game/input/inputTypes'

const TRACKED_CODES = new Set<string>(
  Object.values(LOCAL_INPUT_CONFIG.keyboardCodes),
)

export class KeyboardInputSource {
  private readonly pressedCodes = new Set<string>()
  private readonly eventTarget: Window
  private started = false

  constructor(eventTarget: Window = window) {
    this.eventTarget = eventTarget
  }

  private readonly handleKeyDown = (event: KeyboardEvent) => {
    if (!TRACKED_CODES.has(event.code)) {
      return
    }

    event.preventDefault()
    this.pressedCodes.add(event.code)
  }

  private readonly handleKeyUp = (event: KeyboardEvent) => {
    if (!TRACKED_CODES.has(event.code)) {
      return
    }

    event.preventDefault()
    this.pressedCodes.delete(event.code)
  }

  private readonly handleBlur = () => {
    this.pressedCodes.clear()
  }

  start(): void {
    if (this.started) {
      return
    }

    this.eventTarget.addEventListener('keydown', this.handleKeyDown)
    this.eventTarget.addEventListener('keyup', this.handleKeyUp)
    this.eventTarget.addEventListener('blur', this.handleBlur)
    this.started = true
  }

  read(): InputSourceState {
    const { keyboardCodes } = LOCAL_INPUT_CONFIG
    const lateral =
      Number(this.pressedCodes.has(keyboardCodes.right)) -
      Number(this.pressedCodes.has(keyboardCodes.left))
    const forward =
      Number(this.pressedCodes.has(keyboardCodes.forward)) -
      Number(this.pressedCodes.has(keyboardCodes.backward))

    return {
      connected: true,
      deviceName: 'Keyboard',
      localMove: normalizeMove2D({ lateral, forward }),
      jumpHeld: this.pressedCodes.has(keyboardCodes.jump),
      hitHeld: this.pressedCodes.has(keyboardCodes.hit),
    }
  }

  dispose(): void {
    if (this.started) {
      this.eventTarget.removeEventListener('keydown', this.handleKeyDown)
      this.eventTarget.removeEventListener('keyup', this.handleKeyUp)
      this.eventTarget.removeEventListener('blur', this.handleBlur)
    }

    this.pressedCodes.clear()
    this.started = false
  }
}
