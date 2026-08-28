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
  buttonValue = buttonPressed ? 1 : 0,
  hitButtonPressed = false,
  hitButtonValue = hitButtonPressed ? 1 : 0,
  connected = true,
  id = 'Test Standard Gamepad',
}: {
  axes?: readonly number[]
  buttonPressed?: boolean
  buttonValue?: number
  hitButtonPressed?: boolean
  hitButtonValue?: number
  connected?: boolean
  id?: string
} = {}): Gamepad {
  return {
    axes,
    buttons: [
      {
        pressed: buttonPressed,
        touched: buttonPressed,
        value: buttonValue,
      },
      {
        pressed: hitButtonPressed,
        touched: hitButtonPressed,
        value: hitButtonValue,
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

  it('reports KeyE as hit held and clears it on keyup', () => {
    const source = startKeyboard()
    keyDown('KeyE')
    expect(source.read().hitHeld).toBe(true)

    keyUp('KeyE')
    expect(source.read().hitHeld).toBe(false)
  })

  it('keeps keyboard jump and hit independent and allows both together', () => {
    const source = startKeyboard()
    keyDown('Space')
    expect(source.read()).toMatchObject({ jumpHeld: true, hitHeld: false })

    keyUp('Space')
    keyDown('KeyE')
    expect(source.read()).toMatchObject({ jumpHeld: false, hitHeld: true })

    keyDown('Space')
    expect(source.read()).toMatchObject({ jumpHeld: true, hitHeld: true })
  })

  it('clears all pressed keys when the window blurs', () => {
    const source = startKeyboard()
    keyDown('KeyW')
    keyDown('Space')
    keyDown('KeyE')
    window.dispatchEvent(new Event('blur'))

    expect(source.read()).toMatchObject({
      localMove: { lateral: 0, forward: 0 },
      jumpHeld: false,
      hitHeld: false,
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

  it('reads pressed button 1 as hit held', () => {
    const source = new GamepadInputSource(0)

    expect(
      source.read([createGamepad({ hitButtonPressed: true })]).hitHeld,
    ).toBe(true)
  })

  it('reads button 1 values above the threshold as hit held', () => {
    const source = new GamepadInputSource(0)

    expect(
      source.read([createGamepad({ hitButtonValue: 0.75 })]).hitHeld,
    ).toBe(true)
  })

  it('keeps gamepad jump and hit buttons independent', () => {
    const source = new GamepadInputSource(0)

    expect(source.read([createGamepad({ buttonPressed: true })])).toMatchObject(
      { jumpHeld: true, hitHeld: false },
    )
    expect(
      source.read([createGamepad({ hitButtonPressed: true })]),
    ).toMatchObject({ jumpHeld: false, hitHeld: true })
  })

  it('allows gamepad jump and hit to be held simultaneously', () => {
    const source = new GamepadInputSource(0)

    expect(
      source.read([
        createGamepad({ buttonPressed: true, hitButtonPressed: true }),
      ]),
    ).toMatchObject({ jumpHeld: true, hitHeld: true })
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
      hitHeld: false,
    })
  })
})
