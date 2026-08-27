import { afterEach, describe, expect, it } from 'vitest'
import { GamepadInputSource } from '@/game/input/GamepadInputSource'
import { KeyboardInputSource } from '@/game/input/KeyboardInputSource'

let keyboardSource: KeyboardInputSource | null = null

function startKeyboard(): KeyboardInputSource {
  keyboardSource = new KeyboardInputSource(window)
  keyboardSource.start()
  return keyboardSource
}

function keyDown(code: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, cancelable: true }))
}

function keyUp(code: string): void {
  window.dispatchEvent(new KeyboardEvent('keyup', { code, cancelable: true }))
}

function createGamepad({
  axes = [0, 0],
  buttonPressed = false,
  connected = true,
  id = 'Test Standard Gamepad',
}: {
  axes?: readonly number[]
  buttonPressed?: boolean
  connected?: boolean
  id?: string
} = {}): Gamepad {
  return {
    axes,
    buttons: [
      {
        pressed: buttonPressed,
        touched: buttonPressed,
        value: buttonPressed ? 1 : 0,
      },
    ],
    connected,
    id,
    index: 0,
    mapping: 'standard',
    timestamp: 0,
    vibrationActuator: null,
  } as unknown as Gamepad
}

afterEach(() => {
  keyboardSource?.dispose()
  keyboardSource = null
})

describe('KeyboardInputSource', () => {
  it.each([
    ['KeyW', { lateral: 0, forward: 1 }],
    ['KeyS', { lateral: 0, forward: -1 }],
    ['KeyA', { lateral: -1, forward: 0 }],
    ['KeyD', { lateral: 1, forward: 0 }],
  ])('maps %s to normalized local movement', (code, expected) => {
    const source = startKeyboard()
    keyDown(code)

    expect(source.read().localMove).toEqual(expected)
  })

  it('cancels opposite keys', () => {
    const source = startKeyboard()
    keyDown('KeyW')
    keyDown('KeyS')
    keyDown('KeyA')
    keyDown('KeyD')

    expect(source.read().localMove).toEqual({ lateral: 0, forward: 0 })
  })

  it('normalizes a W plus D diagonal', () => {
    const source = startKeyboard()
    keyDown('KeyW')
    keyDown('KeyD')
    const move = source.read().localMove

    expect(move.lateral).toBeCloseTo(Math.SQRT1_2)
    expect(move.forward).toBeCloseTo(Math.SQRT1_2)
  })

  it('reports Space as jump held and clears it on keyup', () => {
    const source = startKeyboard()
    keyDown('Space')
    expect(source.read().jumpHeld).toBe(true)

    keyUp('Space')
    expect(source.read().jumpHeld).toBe(false)
  })

  it('clears all pressed keys when the window blurs', () => {
    const source = startKeyboard()
    keyDown('KeyW')
    keyDown('Space')
    window.dispatchEvent(new Event('blur'))

    expect(source.read()).toMatchObject({
      localMove: { lateral: 0, forward: 0 },
      jumpHeld: false,
    })
  })

  it('removes listeners and clears state on dispose', () => {
    const source = startKeyboard()
    keyDown('KeyW')
    source.dispose()
    keyDown('KeyD')

    expect(source.read().localMove).toEqual({ lateral: 0, forward: 0 })
  })
})

describe('GamepadInputSource', () => {
  it('reads axes 0 and 1 using browser-standard vertical inversion', () => {
    const source = new GamepadInputSource(0)
    const state = source.read([createGamepad({ axes: [0.5, -0.5] })])

    expect(state.connected).toBe(true)
    expect(state.localMove.lateral).toBeGreaterThan(0)
    expect(state.localMove.forward).toBeGreaterThan(0)
  })

  it('reads button 0 as jump held', () => {
    const source = new GamepadInputSource(0)

    expect(
      source.read([createGamepad({ buttonPressed: true })]).jumpHeld,
    ).toBe(true)
  })

  it('applies the radial deadzone to stick input', () => {
    const source = new GamepadInputSource(0)

    expect(
      source.read([createGamepad({ axes: [0.05, -0.05] })]).localMove,
    ).toEqual({ lateral: 0, forward: 0 })
  })

  it('uses the first connected gamepad as logical slot zero', () => {
    const source = new GamepadInputSource(0)
    const state = source.read([
      null,
      createGamepad({ axes: [1, 0], id: 'First Connected' }),
    ])

    expect(state.deviceName).toBe('First Connected')
    expect(state.localMove.lateral).toBe(1)
  })

  it('returns neutral input immediately after disconnect', () => {
    const source = new GamepadInputSource(0)
    expect(source.read([createGamepad({ axes: [1, 0] })]).connected).toBe(true)

    expect(source.read([])).toEqual({
      connected: false,
      deviceName: 'Gamepad',
      localMove: { lateral: 0, forward: 0 },
      jumpHeld: false,
    })
  })
})
