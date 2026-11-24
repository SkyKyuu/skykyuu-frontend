import {
  GamepadInputSource,
  getNativeGamepads,
  type GamepadProvider,
} from '@/game/input/GamepadInputSource'
import { KeyboardInputSource } from '@/game/input/KeyboardInputSource'
import { localMoveToWorld } from '@/game/input/inputMath'
import type {
  InputSourceState,
  LocalInputBinding,
  LocalMoveInput,
  LocalPlayerInputSnapshot,
} from '@/game/input/inputTypes'
import { validateLocalInputBindings } from '@/game/input/previewInputBindings'

interface LocalInputManagerOptions {
  keyboardTarget?: Window
  gamepadProvider?: GamepadProvider
}

interface SampledInputSnapshot extends LocalPlayerInputSnapshot {
  spikeHeld: boolean
  spikePressed: boolean
  tipHeld: boolean
  tipPressed: boolean
}

interface GamepadSpikeSample {
  index: number
  name: string
  held: boolean
}

function createNeutralSourceState(binding: LocalInputBinding): InputSourceState {
  return {
    connected: binding.deviceKind === 'keyboard',
    deviceName: binding.deviceKind === 'keyboard' ? 'Keyboard' : 'Gamepad',
    localMove: { lateral: 0, forward: 0 },
    jumpHeld: false,
    hitHeld: false,
    forearmPassHeld: false,
    setHeld: false,
    spikeHeld: false,
    tipHeld: false,
  }
}

export class LocalInputManager {
  private readonly bindings: readonly LocalInputBinding[]
  private readonly keyboardSource: KeyboardInputSource | null
  private readonly gamepadSources = new Map<string, GamepadInputSource>()
  private readonly previousJumpHeld = new Map<string, boolean>()
  private readonly previousHitHeld = new Map<string, boolean>()
  private readonly previousForearmPassHeld = new Map<string, boolean>()
  private readonly previousSetHeld = new Map<string, boolean>()
  private readonly previousGamepadSpike = new Map<string, GamepadSpikeSample>()
  private readonly previousGamepadTip = new Map<string, GamepadSpikeSample>()
  private snapshots: readonly SampledInputSnapshot[]
  private started = false

  private readonly gamepadProvider: GamepadProvider

  constructor(
    bindings: readonly LocalInputBinding[],
    options: LocalInputManagerOptions = {},
  ) {
    validateLocalInputBindings(bindings)
    this.bindings = bindings

    const keyboardBinding = bindings.find(
      (binding) => binding.deviceKind === 'keyboard',
    )
    this.keyboardSource = keyboardBinding
      ? new KeyboardInputSource(options.keyboardTarget)
      : null
    this.gamepadProvider = options.gamepadProvider ?? getNativeGamepads

    for (const binding of bindings) {
      if (binding.deviceKind === 'gamepad') {
        this.gamepadSources.set(
          binding.playerId,
          new GamepadInputSource(binding.gamepadSlot),
        )
      }
      this.previousJumpHeld.set(binding.playerId, false)
      this.previousHitHeld.set(binding.playerId, false)
      this.previousForearmPassHeld.set(binding.playerId, false)
      this.previousSetHeld.set(binding.playerId, false)
    }

    this.snapshots = bindings.map((binding) =>
      this.createSnapshot(
        binding,
        createNeutralSourceState(binding),
        false,
        false,
        false,
        false,
      ),
    )
  }

  start(): void {
    if (this.started) {
      return
    }

    this.keyboardSource?.start()
    this.started = true
  }

  update(): readonly SampledInputSnapshot[] {
    let gamepads: ReturnType<GamepadProvider> = []

    if (this.gamepadSources.size > 0) {
      try {
        gamepads = this.gamepadProvider()
      } catch {
        gamepads = []
      }
    }

    this.snapshots = this.bindings.map((binding) => {
      const gamepadState = this.gamepadSources.get(binding.playerId)?.read(gamepads)
      const sourceState = (
        binding.deviceKind === 'keyboard' ? this.keyboardSource?.read() : gamepadState
      ) ?? createNeutralSourceState(binding)
      const spikePressAim = binding.deviceKind === 'keyboard'
        ? this.keyboardSource?.takeSpikePressAim()
        : undefined
      let tipPressAim = binding.deviceKind === 'keyboard'
        ? this.keyboardSource?.takeTipPressAim()
        : undefined
      let spikePressed = spikePressAim !== undefined
      let tipPressed = tipPressAim !== undefined
      if (gamepadState?.gamepadIndex !== undefined) {
        const previous = this.previousGamepadSpike.get(binding.playerId)
        // Treat a newly connected or reassigned device as a held-state baseline.
        spikePressed = gamepadState.spikeHeld && previous !== undefined &&
          previous.index === gamepadState.gamepadIndex && previous.name === gamepadState.deviceName &&
          !previous.held
        this.previousGamepadSpike.set(binding.playerId, {
          index: gamepadState.gamepadIndex,
          name: gamepadState.deviceName,
          held: gamepadState.spikeHeld,
        })
        const previousTip = this.previousGamepadTip.get(binding.playerId)
        tipPressed = gamepadState.tipHeld === true && previousTip !== undefined &&
          previousTip.index === gamepadState.gamepadIndex && previousTip.name === gamepadState.deviceName &&
          !previousTip.held
        if (tipPressed) tipPressAim = Object.freeze({ ...gamepadState.localMove })
        this.previousGamepadTip.set(binding.playerId, {
          index: gamepadState.gamepadIndex,
          name: gamepadState.deviceName,
          held: gamepadState.tipHeld === true,
        })
      } else {
        this.previousGamepadSpike.delete(binding.playerId)
        this.previousGamepadTip.delete(binding.playerId)
      }
      const wasJumpHeld = this.previousJumpHeld.get(binding.playerId) ?? false
      const jumpPressed = sourceState.jumpHeld && !wasJumpHeld
      const wasHitHeld = this.previousHitHeld.get(binding.playerId) ?? false
      const hitPressed = sourceState.hitHeld && !wasHitHeld
      const wasForearmPassHeld = this.previousForearmPassHeld.get(binding.playerId) ?? false
      const forearmPassPressed = sourceState.forearmPassHeld && !wasForearmPassHeld
      const wasSetHeld = this.previousSetHeld.get(binding.playerId) ?? false
      const setPressed = sourceState.setHeld && !wasSetHeld

      this.previousJumpHeld.set(binding.playerId, sourceState.jumpHeld)
      this.previousHitHeld.set(binding.playerId, sourceState.hitHeld)
      this.previousForearmPassHeld.set(binding.playerId, sourceState.forearmPassHeld)
      this.previousSetHeld.set(binding.playerId, sourceState.setHeld)
      return this.createSnapshot(
        binding,
        sourceState,
        jumpPressed,
        hitPressed,
        forearmPassPressed,
        setPressed,
        spikePressed,
        spikePressAim,
        tipPressed,
        tipPressAim,
      )
    })

    return this.snapshots
  }

  getSnapshots(): readonly SampledInputSnapshot[] {
    return this.snapshots
  }

  dispose(): void {
    this.keyboardSource?.dispose()
    this.previousJumpHeld.clear()
    this.previousHitHeld.clear()
    this.previousForearmPassHeld.clear()
    this.previousSetHeld.clear()
    this.previousGamepadSpike.clear()
    this.previousGamepadTip.clear()
    this.snapshots = this.snapshots.map((snapshot) => ({
      ...snapshot, spikeHeld: false, spikePressed: false, spikePressAim: undefined,
      tipHeld: false, tipPressed: false, tipPressAim: undefined,
    }))
    this.started = false
  }

  private createSnapshot(
    binding: LocalInputBinding,
    sourceState: InputSourceState,
    jumpPressed: boolean,
    hitPressed: boolean,
    forearmPassPressed: boolean,
    setPressed: boolean,
    spikePressed = false,
    spikePressAim?: Readonly<LocalMoveInput>,
    tipPressed = false,
    tipPressAim?: Readonly<LocalMoveInput>,
  ): SampledInputSnapshot {
    return {
      playerId: binding.playerId,
      teamSide: binding.teamSide,
      deviceKind: binding.deviceKind,
      deviceName: sourceState.deviceName,
      deviceConnected: sourceState.connected,
      localMove: sourceState.localMove,
      worldMove: localMoveToWorld(binding.teamSide, sourceState.localMove),
      jumpHeld: sourceState.jumpHeld,
      jumpPressed,
      hitHeld: sourceState.hitHeld,
      hitPressed,
      forearmPassHeld: sourceState.forearmPassHeld,
      forearmPassPressed,
      setHeld: sourceState.setHeld,
      setPressed,
      spikeHeld: sourceState.spikeHeld,
      spikePressed,
      spikePressAim,
      tipHeld: sourceState.tipHeld === true,
      tipPressed,
      tipPressAim,
    }
  }
}
