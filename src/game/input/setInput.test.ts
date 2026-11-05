import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createFrameActionIntents } from '@/game/actions/actionIntegrationBridge'
import { createSetIntent } from '@/game/actions/setIntent'
import { GamepadInputSource } from '@/game/input/GamepadInputSource'
import { LOCAL_INPUT_CONFIG } from '@/game/input/inputConfig'
import type { LocalInputBinding } from '@/game/input/inputTypes'
import { LocalInputManager } from '@/game/input/LocalInputManager'

const bindings = [
  { playerId: 'a', teamSide: 'A', deviceKind: 'keyboard' },
  { playerId: 'b', teamSide: 'B', deviceKind: 'gamepad', gamepadSlot: 0 },
] as const satisfies readonly LocalInputBinding[]

function sendKey(type: 'keydown' | 'keyup', code: string, repeat = false) {
  const event = new KeyboardEvent(type, { code, repeat, cancelable: true })
  window.dispatchEvent(event)
  return event
}

function gamepad(setValue: number, pressed: readonly number[] = [], connected = true): Gamepad {
  return {
    id: 'Test gamepad',
    index: 0,
    timestamp: 0,
    mapping: 'standard',
    connected,
    axes: [0.4, -0.3],
    buttons: Array.from({ length: 5 }, (_, index) => ({
      pressed: pressed.includes(index),
      touched: false,
      value: index === 2 ? setValue : Number(pressed.includes(index)),
    })),
    vibrationActuator: null,
  } as unknown as Gamepad
}

describe('Set input and frame capture', () => {
  let pads: readonly (Gamepad | null)[]
  let manager: LocalInputManager

  beforeEach(() => {
    pads = []
    manager = new LocalInputManager(bindings, { keyboardTarget: window, gamepadProvider: () => pads })
    manager.start()
  })

  afterEach(() => manager.dispose())

  it('binds R and button 2 with the original inputs and deadzone', () => {
    expect(LOCAL_INPUT_CONFIG.keyboardCodes).toMatchObject({ jump: 'Space', hit: 'KeyE', forearmPass: 'KeyQ', set: 'KeyR' })
    expect(LOCAL_INPUT_CONFIG.gamepadButtons).toEqual({ jump: 0, hit: 1, forearmPass: 4, set: 2 })
    expect(LOCAL_INPUT_CONFIG.gamepadDeadzone).toBe(0.15)
  })

  it('captures release and re-press, ignoring repeated keydown while held', () => {
    expect(manager.getSnapshots()[0]).toMatchObject({ setHeld: false, setPressed: false })
    expect(sendKey('keydown', 'KeyR').defaultPrevented).toBe(true)
    expect(manager.update()[0]).toMatchObject({ setHeld: true, setPressed: true, hitHeld: false, forearmPassHeld: false })
    sendKey('keydown', 'KeyR', true)
    expect(manager.update()[0]).toMatchObject({ setHeld: true, setPressed: false })
    sendKey('keyup', 'KeyR')
    expect(manager.update()[0]).toMatchObject({ setHeld: false, setPressed: false })
    sendKey('keydown', 'KeyR')
    expect(manager.update()[0]).toMatchObject({ setHeld: true, setPressed: true })
  })

  it('captures E/Q/R simultaneously and preserves movement and jump when only R is released', () => {
    for (const key of ['KeyW', 'KeyD', 'Space', 'KeyE', 'KeyQ', 'KeyR']) sendKey('keydown', key)
    const [snapshot] = manager.update()
    expect(snapshot).toMatchObject({ jumpPressed: true, hitPressed: true, forearmPassPressed: true, setPressed: true })
    expect(snapshot.localMove.lateral).toBeCloseTo(Math.SQRT1_2, 14)
    expect(snapshot.localMove.forward).toBeCloseTo(Math.SQRT1_2, 14)
    expect(createFrameActionIntents([snapshot]).map(({ actionType }) => actionType)).toEqual(['GENERIC_HIT', 'FOREARM_PASS', 'SET'])
    expect(createFrameActionIntents(manager.update())).toEqual([])
    sendKey('keyup', 'KeyR')
    expect(manager.update()[0]).toMatchObject({
      jumpHeld: true, jumpPressed: false, hitHeld: true, hitPressed: false,
      forearmPassHeld: true, forearmPassPressed: false, setHeld: false, setPressed: false,
      localMove: snapshot.localMove, worldMove: snapshot.worldMove,
    })
  })

  it.each([[0.5, false], [0.5001, true], [1, true]] as const)('samples analog button 2 value %s', (value, held) => {
    const source = new GamepadInputSource(0)
    expect(source.read([gamepad(value)])).toMatchObject({ setHeld: held, hitHeld: false, forearmPassHeld: false, jumpHeld: false })
    expect(source.read([gamepad(0, [2])]).setHeld).toBe(true)
  })

  it('keeps players independent and restores a fresh gamepad edge after reconnect', () => {
    pads = [gamepad(0, [0, 1, 2, 4])]
    sendKey('keydown', 'KeyR')
    const snapshots = manager.update()
    expect(snapshots[0]).toMatchObject({ setPressed: true, hitPressed: false })
    expect(snapshots[1]).toMatchObject({ setPressed: true, hitPressed: true, forearmPassPressed: true, jumpPressed: true })
    expect(createFrameActionIntents(snapshots).map(({ playerId, actionType }) => [playerId, actionType])).toEqual([
      ['a', 'SET'], ['b', 'GENERIC_HIT'], ['b', 'FOREARM_PASS'], ['b', 'SET'],
    ])
    expect(manager.update().map(({ setPressed }) => setPressed)).toEqual([false, false])
    pads = [gamepad(1, [], false)]
    expect(manager.update()[1]).toMatchObject({
      deviceConnected: false, setHeld: false, setPressed: false, jumpHeld: false,
      localMove: { lateral: 0, forward: 0 },
    })
    pads = [gamepad(1)]
    expect(manager.update().map(({ setPressed }) => setPressed)).toEqual([false, true])
  })

  it('keeps the Team B local aim, button flags and identity in a detached, frozen intent', () => {
    pads = [gamepad(1)]
    const snapshot = manager.update()[1]
    const [frameIntent] = createFrameActionIntents([snapshot])
    const { lateral, forward } = snapshot.localMove
    expect(lateral).toBeGreaterThan(0)
    expect(forward).toBeGreaterThan(0)
    expect(snapshot.worldMove.worldZ).toBe(-forward)
    const intent = createSetIntent(snapshot)
    expect(frameIntent).toEqual(intent)
    expect(Object.isFrozen(intent)).toBe(true)
    snapshot.localMove.lateral = 0
    snapshot.localMove.forward = 0
    expect(intent).toEqual({
      actionType: 'SET', playerId: 'b', setHeld: true, setPressed: true, aimLateral: lateral, aimForward: forward,
    })
    expect(createSetIntent(manager.update()[1])).toMatchObject({ setHeld: true, setPressed: false })
  })

  it('clears keyboard and edge state on blur, dispose and restart', () => {
    sendKey('keydown', 'KeyR')
    expect(manager.update()[0].setPressed).toBe(true)
    window.dispatchEvent(new Event('blur'))
    expect(manager.update()[0]).toMatchObject({ setHeld: false, setPressed: false })
    sendKey('keydown', 'KeyR')
    expect(manager.update()[0].setPressed).toBe(true)
    manager.dispose()
    expect(manager.update()[0]).toMatchObject({ setHeld: false, setPressed: false })
    manager.start()
    sendKey('keydown', 'KeyR')
    expect(manager.update()[0].setPressed).toBe(true)
  })
})
