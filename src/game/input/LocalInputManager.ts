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
  LocalPlayerInputSnapshot,
} from '@/game/input/inputTypes'
import { validateLocalInputBindings } from '@/game/input/previewInputBindings'

interface LocalInputManagerOptions {
  keyboardTarget?: Window
  gamepadProvider?: GamepadProvider
}

function createNeutralSourceState(binding: LocalInputBinding): InputSourceState {
  return {
    connected: binding.deviceKind === 'keyboard',
    deviceName: binding.deviceKind === 'keyboard' ? 'Keyboard' : 'Gamepad',
    localMove: { lateral: 0, forward: 0 },
    jumpHeld: false,
  }
}

export class LocalInputManager {
  private readonly bindings: readonly LocalInputBinding[]
  private readonly keyboardSource: KeyboardInputSource | null
  private readonly gamepadSources = new Map<string, GamepadInputSource>()
  private readonly previousJumpHeld = new Map<string, boolean>()
  private snapshots: readonly LocalPlayerInputSnapshot[]
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
    }

    this.snapshots = bindings.map((binding) =>
      this.createSnapshot(binding, createNeutralSourceState(binding), false),
    )
  }

  start(): void {
    if (this.started) {
      return
    }

    this.keyboardSource?.start()
    this.started = true
  }

  update(): readonly LocalPlayerInputSnapshot[] {
    let gamepads: ReturnType<GamepadProvider> = []

    if (this.gamepadSources.size > 0) {
      try {
        gamepads = this.gamepadProvider()
      } catch {
        gamepads = []
      }
    }

    this.snapshots = this.bindings.map((binding) => {
      const sourceState =
        binding.deviceKind === 'keyboard'
          ? (this.keyboardSource?.read() ?? createNeutralSourceState(binding))
          : (this.gamepadSources.get(binding.playerId)?.read(gamepads) ??
            createNeutralSourceState(binding))
      const wasJumpHeld = this.previousJumpHeld.get(binding.playerId) ?? false
      const jumpPressed = sourceState.jumpHeld && !wasJumpHeld

      this.previousJumpHeld.set(binding.playerId, sourceState.jumpHeld)
      return this.createSnapshot(binding, sourceState, jumpPressed)
    })

    return this.snapshots
  }

  getSnapshots(): readonly LocalPlayerInputSnapshot[] {
    return this.snapshots
  }

  dispose(): void {
    this.keyboardSource?.dispose()
    this.previousJumpHeld.clear()
    this.started = false
  }

  private createSnapshot(
    binding: LocalInputBinding,
    sourceState: InputSourceState,
    jumpPressed: boolean,
  ): LocalPlayerInputSnapshot {
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
    }
  }
}
