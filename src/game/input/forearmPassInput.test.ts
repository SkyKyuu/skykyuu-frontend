import { afterEach, describe, expect, it } from 'vitest'
import { LOCAL_INPUT_CONFIG } from '@/game/input/inputConfig'
import { KeyboardInputSource } from '@/game/input/KeyboardInputSource'
import { GamepadInputSource } from '@/game/input/GamepadInputSource'
import { LocalInputManager } from '@/game/input/LocalInputManager'
import type { LocalInputBinding } from '@/game/input/inputTypes'

const KEYBOARD: LocalInputBinding = { playerId: 'keyboard', teamSide: 'A', deviceKind: 'keyboard' }
let keyboard: KeyboardInputSource | undefined
let manager: LocalInputManager | undefined

function key(type: 'keydown' | 'keyup', code: string) {
  window.dispatchEvent(new KeyboardEvent(type, { code, cancelable: true }))
}

function gamepad(pass = false, hit = false, jump = false, value = pass ? 1 : 0): Gamepad {
  return {
    id: 'Test Gamepad', connected: true, axes: [0.5, -0.5],
    buttons: Array.from({ length: 5 }, (_, index) => {
      const pressed = index === 4 ? pass : index === 1 ? hit : index === 0 && jump
      return { pressed, touched: pressed, value: index === 4 ? value : Number(pressed) }
    }),
  } as unknown as Gamepad
}

afterEach(() => {
  keyboard?.dispose()
  manager?.dispose()
  keyboard = undefined
  manager = undefined
})

describe('forearm pass input sources', () => {
  it('adds Q and button 4 while preserving all existing controls and tuning', () => {
    expect(LOCAL_INPUT_CONFIG).toEqual({
      maxLocalPlayers: 4, gamepadDeadzone: 0.15, debugUpdateIntervalMs: 100,
      keyboardCodes: {
        forward: 'KeyW', backward: 'KeyS', left: 'KeyA', right: 'KeyD',
        jump: 'Space', hit: 'KeyE', forearmPass: 'KeyQ', set: 'KeyR',
      },
      gamepadButtons: { jump: 0, hit: 1, forearmPass: 4, set: 2 },
    })
  })

  it.each([
    [['KeyQ'], true, false, false],
    [['KeyE'], false, true, false],
    [['KeyQ', 'KeyE', 'Space'], true, true, true],
  ] as const)('keeps keyboard commands %s independent', (codes, pass, hit, jump) => {
    keyboard = new KeyboardInputSource(window)
    keyboard.start()
    for (const code of codes) key('keydown', code)
    expect(keyboard.read()).toMatchObject({ forearmPassHeld: pass, hitHeld: hit, jumpHeld: jump })
    for (const code of codes) key('keyup', code)
    expect(keyboard.read()).toMatchObject({ forearmPassHeld: false, hitHeld: false, jumpHeld: false })
  })

  it('releases Q on blur and removes its listener and state on dispose', () => {
    keyboard = new KeyboardInputSource(window)
    keyboard.start()
    key('keydown', 'KeyQ')
    expect(keyboard.read().forearmPassHeld).toBe(true)
    window.dispatchEvent(new Event('blur'))
    expect(keyboard.read().forearmPassHeld).toBe(false)
    key('keydown', 'KeyQ')
    expect(keyboard.read().forearmPassHeld).toBe(true)
    keyboard.dispose()
    key('keydown', 'KeyQ')
    expect(keyboard.read().forearmPassHeld).toBe(false)
  })

  it.each([
    [true, false, false], [false, true, false], [true, true, true],
  ])('keeps gamepad pass %s, hit %s and jump %s independent', (pass, hit, jump) => {
    const source = new GamepadInputSource(0)
    expect(source.read([gamepad(pass, hit, jump)])).toMatchObject({
      forearmPassHeld: pass, hitHeld: hit, jumpHeld: jump,
    })
  })

  it.each([[0.5, false], [0.75, true]] as const)('reads button 4 analog value %s consistently with existing buttons', (value, held) => {
    expect(new GamepadInputSource(0).read([gamepad(false, false, false, value)]).forearmPassHeld).toBe(held)
  })

  it('neutralizes absent buttons, disconnected devices and missing slots', () => {
    const source = new GamepadInputSource(0)
    const pad = gamepad(true)
    expect(source.read([pad]).forearmPassHeld).toBe(true)
    expect(source.read([{ ...pad, connected: false }]).forearmPassHeld).toBe(false)
    expect(source.read([{ ...pad, buttons: [] }]).forearmPassHeld).toBe(false)
    expect(source.read([]).forearmPassHeld).toBe(false)
  })
})

describe('independent forearm pass edge detection', () => {
  it.each(['keyboard', 'gamepad'] as const)('tracks press, hold, release and repress on %s without affecting hit', (device) => {
    let held = false
    manager = new LocalInputManager([device === 'keyboard' ? KEYBOARD : {
      playerId: 'pad', teamSide: 'B', deviceKind: 'gamepad', gamepadSlot: 0,
    }], { keyboardTarget: window, gamepadProvider: () => [gamepad(held)] })
    expect(manager.getSnapshots()[0]).toMatchObject({ forearmPassHeld: false, forearmPassPressed: false })
    manager.start()
    const setHeld = (value: boolean) => {
      held = value
      if (device === 'keyboard') key(value ? 'keydown' : 'keyup', 'KeyQ')
    }
    expect(manager.update()[0]).toMatchObject({ forearmPassHeld: false, forearmPassPressed: false })
    setHeld(true)
    expect(manager.update()[0]).toMatchObject({ forearmPassHeld: true, forearmPassPressed: true, hitHeld: false, hitPressed: false })
    if (device === 'keyboard') key('keydown', 'KeyQ')
    expect(manager.update()[0]).toMatchObject({ forearmPassHeld: true, forearmPassPressed: false })
    setHeld(false)
    expect(manager.update()[0]).toMatchObject({ forearmPassHeld: false, forearmPassPressed: false })
    setHeld(true)
    expect(manager.update()[0]).toMatchObject({ forearmPassHeld: true, forearmPassPressed: true })
  })

  it.each(['keyboard', 'gamepad'] as const)('preserves simultaneous generic hit and pass edges on %s', (device) => {
    let pass = false
    let hit = false
    manager = new LocalInputManager([device === 'keyboard' ? KEYBOARD : {
      playerId: 'pad', teamSide: 'B', deviceKind: 'gamepad', gamepadSlot: 0,
    }], { keyboardTarget: window, gamepadProvider: () => [gamepad(pass, hit)] })
    manager.start()
    pass = true
    hit = true
    key('keydown', 'KeyQ')
    key('keydown', 'KeyE')
    expect(manager.update()[0]).toMatchObject({ hitPressed: true, forearmPassPressed: true })
    expect(manager.update()[0]).toMatchObject({ hitHeld: true, hitPressed: false, forearmPassHeld: true, forearmPassPressed: false })
    pass = false
    key('keyup', 'KeyQ')
    expect(manager.update()[0]).toMatchObject({ hitHeld: true, hitPressed: false, forearmPassHeld: false, forearmPassPressed: false })
    pass = true
    key('keydown', 'KeyQ')
    expect(manager.update()[0]).toMatchObject({ hitPressed: false, forearmPassPressed: true })
    hit = false
    key('keyup', 'KeyE')
    manager.update()
    hit = true
    key('keydown', 'KeyE')
    expect(manager.update()[0]).toMatchObject({ hitPressed: true, forearmPassPressed: false })
  })

  it('neutralizes keyboard on blur and permits a fresh press after release', () => {
    manager = new LocalInputManager([KEYBOARD], { keyboardTarget: window })
    manager.start()
    key('keydown', 'KeyQ')
    expect(manager.update()[0].forearmPassPressed).toBe(true)
    window.dispatchEvent(new Event('blur'))
    expect(manager.update()[0]).toMatchObject({ forearmPassHeld: false, forearmPassPressed: false })
    expect(manager.update()[0].forearmPassPressed).toBe(false)
    key('keydown', 'KeyQ')
    expect(manager.update()[0].forearmPassPressed).toBe(true)
  })

  it('clears keyboard pass history on dispose without generating an initialization edge', () => {
    manager = new LocalInputManager([KEYBOARD], { keyboardTarget: window })
    manager.start()
    key('keydown', 'KeyQ')
    expect(manager.update()[0].forearmPassPressed).toBe(true)
    manager.dispose()
    manager.start()
    expect(manager.update()[0]).toMatchObject({ forearmPassHeld: false, forearmPassPressed: false })
    key('keydown', 'KeyQ')
    expect(manager.update()[0].forearmPassPressed).toBe(true)
  })

  it.each([false, true])('neutralizes disconnect and resumes using current reconnect held=%s', (reconnectHeld) => {
    let connected = true
    let held = true
    manager = new LocalInputManager([{
      playerId: 'pad', teamSide: 'B', deviceKind: 'gamepad', gamepadSlot: 0,
    }], { gamepadProvider: () => connected ? [gamepad(held)] : [] })
    expect(manager.getSnapshots()[0].forearmPassPressed).toBe(false)
    expect(manager.update()[0].forearmPassPressed).toBe(true)
    connected = false
    expect(manager.update()[0]).toMatchObject({ deviceConnected: false, forearmPassHeld: false, forearmPassPressed: false })
    held = reconnectHeld
    connected = true
    expect(manager.update()[0]).toMatchObject({ forearmPassHeld: held, forearmPassPressed: held })
    expect(manager.update()[0].forearmPassPressed).toBe(false)
    held = false
    manager.update()
    held = true
    expect(manager.update()[0].forearmPassPressed).toBe(true)
  })

  it('isolates all player histories across keyboard and two gamepads', () => {
    let first = false
    let second = false
    manager = new LocalInputManager([
      KEYBOARD,
      { playerId: 'pad-a', teamSide: 'A', deviceKind: 'gamepad', gamepadSlot: 0 },
      { playerId: 'pad-b', teamSide: 'B', deviceKind: 'gamepad', gamepadSlot: 1 },
    ], { keyboardTarget: window, gamepadProvider: () => [gamepad(first), gamepad(second)] })
    manager.start()
    expect(manager.update().map((s) => s.forearmPassPressed)).toEqual([false, false, false])
    key('keydown', 'KeyQ')
    first = true
    expect(manager.update().map((s) => s.forearmPassPressed)).toEqual([true, true, false])
    second = true
    expect(manager.update().map((s) => s.forearmPassPressed)).toEqual([false, false, true])
    first = false
    manager.update()
    first = true
    expect(manager.update().map((s) => s.forearmPassPressed)).toEqual([false, true, false])
  })

  it('neutralizes provider failures without creating a pass edge', () => {
    let fail = false
    manager = new LocalInputManager([{
      playerId: 'pad', teamSide: 'A', deviceKind: 'gamepad', gamepadSlot: 0,
    }], { gamepadProvider: () => { if (fail) throw new Error('Unavailable'); return [gamepad(true)] } })
    expect(manager.update()[0].forearmPassPressed).toBe(true)
    fail = true
    expect(manager.update()[0]).toMatchObject({ forearmPassHeld: false, forearmPassPressed: false })
  })
})
