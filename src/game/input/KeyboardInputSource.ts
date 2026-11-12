import { LOCAL_INPUT_CONFIG } from '@/game/input/inputConfig'
import { normalizeMove2D } from '@/game/input/inputMath'
import type { InputSourceState, LocalMoveInput } from '@/game/input/inputTypes'

const TRACKED_CODES = new Set<string>(
  Object.values(LOCAL_INPUT_CONFIG.keyboardCodes),
)

export class KeyboardInputSource {
  private readonly pressedCodes = new Set<string>()
  private readonly eventTarget: Window
  private started = false
  private spikePressAim: Readonly<LocalMoveInput> | undefined

  constructor(eventTarget: Window = window) {
    this.eventTarget = eventTarget
  }

  private readonly handleKeyDown = (event: KeyboardEvent) => {
    if (!TRACKED_CODES.has(event.code)) {
      return
    }

    event.preventDefault()
    // Auto-repeat after blur must not create a fresh press.
    if (event.repeat || this.pressedCodes.has(event.code)) return
    this.pressedCodes.add(event.code)
    if (event.code === LOCAL_INPUT_CONFIG.keyboardCodes.spike) {
      // A later press before polling supersedes this capture on the same tick.
      this.spikePressAim = Object.freeze(this.readLocalMove())
    }
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
    this.spikePressAim = undefined
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

  takeSpikePressAim(): Readonly<LocalMoveInput> | undefined {
    const aim = this.spikePressAim
    this.spikePressAim = undefined
    return aim
  }

  private readLocalMove(): LocalMoveInput {
    const { keyboardCodes } = LOCAL_INPUT_CONFIG
    const lateral =
      Number(this.pressedCodes.has(keyboardCodes.right)) -
      Number(this.pressedCodes.has(keyboardCodes.left))
    const forward =
      Number(this.pressedCodes.has(keyboardCodes.forward)) -
      Number(this.pressedCodes.has(keyboardCodes.backward))

    return normalizeMove2D({ lateral, forward })
  }

  read(): InputSourceState {
    const { keyboardCodes } = LOCAL_INPUT_CONFIG
    return {
      connected: true,
      deviceName: 'Keyboard',
      localMove: this.readLocalMove(),
      jumpHeld: this.pressedCodes.has(keyboardCodes.jump),
      hitHeld: this.pressedCodes.has(keyboardCodes.hit),
      forearmPassHeld: this.pressedCodes.has(keyboardCodes.forearmPass),
      setHeld: this.pressedCodes.has(keyboardCodes.set),
      spikeHeld: this.pressedCodes.has(keyboardCodes.spike),
    }
  }

  dispose(): void {
    if (this.started) {
      this.eventTarget.removeEventListener('keydown', this.handleKeyDown)
      this.eventTarget.removeEventListener('keyup', this.handleKeyUp)
      this.eventTarget.removeEventListener('blur', this.handleBlur)
    }

    this.pressedCodes.clear()
    this.spikePressAim = undefined
    this.started = false
  }
}
