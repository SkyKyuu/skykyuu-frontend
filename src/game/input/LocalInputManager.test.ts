import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocalInputManager } from '@/game/input/LocalInputManager'
import type { LocalInputBinding } from '@/game/input/inputTypes'
import {
  createPreviewInputBindings,
  validateLocalInputBindings,
} from '@/game/input/previewInputBindings'

const KEYBOARD_BINDING: LocalInputBinding = {
  playerId: 'player-1',
  teamSide: 'A',
  deviceKind: 'keyboard',
}

const FIVE_LOCAL_INPUT_BINDINGS: LocalInputBinding[] = [
  KEYBOARD_BINDING,
  ...Array.from(
    { length: 4 },
    (_, index): LocalInputBinding => ({
      playerId: `player-${index + 2}`,
      teamSide: index % 2 === 0 ? 'B' : 'A',
      deviceKind: 'gamepad',
      gamepadSlot: index,
    }),
  ),
]

let manager: LocalInputManager | null = null

function keyDown(code: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, cancelable: true }))
}

function keyUp(code: string): void {
  window.dispatchEvent(new KeyboardEvent('keyup', { code, cancelable: true }))
}

function createGamepad({
  hitHeld = false,
  id = 'Test Gamepad',
}: {
  hitHeld?: boolean
  id?: string
} = {}): Gamepad {
  return {
    axes: [0, 0],
    buttons: [
      { pressed: false, touched: false, value: 0 },
      { pressed: hitHeld, touched: hitHeld, value: hitHeld ? 1 : 0 },
    ],
    connected: true,
    id,
  } as unknown as Gamepad
}

afterEach(() => {
  manager?.dispose()
  manager = null
})

describe('LocalInputManager', () => {
  it('creates an initially neutral hit snapshot', () => {
    manager = new LocalInputManager([KEYBOARD_BINDING], {
      keyboardTarget: window,
    })

    expect(manager.getSnapshots()[0]).toMatchObject({
      hitHeld: false,
      hitPressed: false,
    })
  })

  it('detects jumpPressed only on false-to-true transitions', () => {
    manager = new LocalInputManager([KEYBOARD_BINDING], {
      keyboardTarget: window,
    })
    manager.start()

    expect(manager.update()[0]).toMatchObject({
      jumpHeld: false,
      jumpPressed: false,
    })

    keyDown('Space')
    expect(manager.update()[0]).toMatchObject({
      jumpHeld: true,
      jumpPressed: true,
    })
    expect(manager.update()[0]).toMatchObject({
      jumpHeld: true,
      jumpPressed: false,
    })

    keyUp('Space')
    expect(manager.update()[0]).toMatchObject({
      jumpHeld: false,
      jumpPressed: false,
    })

    keyDown('Space')
    expect(manager.update()[0]).toMatchObject({
      jumpHeld: true,
      jumpPressed: true,
    })
  })

  it('detects hitPressed only on false-to-true transitions', () => {
    manager = new LocalInputManager([KEYBOARD_BINDING], {
      keyboardTarget: window,
    })
    manager.start()

    expect(manager.update()[0]).toMatchObject({
      hitHeld: false,
      hitPressed: false,
    })

    keyDown('KeyE')
    expect(manager.update()[0]).toMatchObject({
      hitHeld: true,
      hitPressed: true,
    })
    expect(manager.update()[0]).toMatchObject({
      hitHeld: true,
      hitPressed: false,
    })

    keyUp('KeyE')
    expect(manager.update()[0]).toMatchObject({
      hitHeld: false,
      hitPressed: false,
    })

    keyDown('KeyE')
    expect(manager.update()[0]).toMatchObject({
      hitHeld: true,
      hitPressed: true,
    })
  })

  it('clears hit edge history on dispose', () => {
    manager = new LocalInputManager([KEYBOARD_BINDING], {
      keyboardTarget: window,
    })
    manager.start()
    keyDown('KeyE')
    expect(manager.update()[0].hitPressed).toBe(true)

    manager.dispose()
    manager.start()
    keyDown('KeyE')

    expect(manager.update()[0].hitPressed).toBe(true)
  })

  it('tracks hitPressed independently for each playerId', () => {
    let firstPlayerHit = false
    let secondPlayerHit = false
    manager = new LocalInputManager(
      [
        {
          playerId: 'player-1',
          teamSide: 'A',
          deviceKind: 'gamepad',
          gamepadSlot: 0,
        },
        {
          playerId: 'player-2',
          teamSide: 'B',
          deviceKind: 'gamepad',
          gamepadSlot: 1,
        },
      ],
      {
        gamepadProvider: () => [
          createGamepad({ hitHeld: firstPlayerHit, id: 'First Gamepad' }),
          createGamepad({ hitHeld: secondPlayerHit, id: 'Second Gamepad' }),
        ],
      },
    )

    firstPlayerHit = true
    expect(manager.update().map(({ hitPressed }) => hitPressed)).toEqual([
      true,
      false,
    ])

    secondPlayerHit = true
    expect(manager.update().map(({ hitPressed }) => hitPressed)).toEqual([
      false,
      true,
    ])
  })

  it('maps TEAM_B gamepad intent without coupling it to a camera', () => {
    const gamepad = {
      axes: [1, -1],
      buttons: [{ pressed: false, touched: false, value: 0 }],
      connected: true,
      id: 'Test Gamepad',
    } as unknown as Gamepad
    manager = new LocalInputManager(
      [
        {
          playerId: 'player-2',
          teamSide: 'B',
          deviceKind: 'gamepad',
          gamepadSlot: 0,
        },
      ],
      { gamepadProvider: () => [gamepad] },
    )

    const snapshot = manager.update()[0]

    expect(snapshot.localMove.lateral).toBeGreaterThan(0)
    expect(snapshot.localMove.forward).toBeGreaterThan(0)
    expect(snapshot.worldMove.worldX).toBeLessThan(0)
    expect(snapshot.worldMove.worldZ).toBeLessThan(0)
  })

  it('reads navigator gamepads only once per update', () => {
    const provider = vi.fn(() => [])
    manager = new LocalInputManager(
      [
        {
          playerId: 'player-1',
          teamSide: 'A',
          deviceKind: 'gamepad',
          gamepadSlot: 0,
        },
        {
          playerId: 'player-2',
          teamSide: 'B',
          deviceKind: 'gamepad',
          gamepadSlot: 1,
        },
      ],
      { gamepadProvider: provider },
    )

    manager.update()

    expect(provider).toHaveBeenCalledTimes(1)
  })

  it('converts a disconnected gamepad to a neutral snapshot', () => {
    let connected = true
    const gamepad = {
      axes: [1, 0],
      buttons: [
        { pressed: true, touched: true, value: 1 },
        { pressed: true, touched: true, value: 1 },
      ],
      connected: true,
      id: 'Temporary Gamepad',
    } as unknown as Gamepad
    manager = new LocalInputManager(
      [
        {
          playerId: 'player-2',
          teamSide: 'B',
          deviceKind: 'gamepad',
          gamepadSlot: 0,
        },
      ],
      { gamepadProvider: () => (connected ? [gamepad] : []) },
    )

    expect(manager.update()[0]).toMatchObject({
      jumpHeld: true,
      hitHeld: true,
      hitPressed: true,
    })
    connected = false

    expect(manager.update()[0]).toMatchObject({
      deviceConnected: false,
      localMove: { lateral: 0, forward: 0 },
      worldMove: { worldX: 0, worldZ: 0 },
      jumpHeld: false,
      jumpPressed: false,
      hitHeld: false,
      hitPressed: false,
    })
  })
})

describe('local input bindings', () => {
  it('builds the two-player preview from player identities', () => {
    expect(
      createPreviewInputBindings([
        { playerId: 'player-1', teamSide: 'A' },
        { playerId: 'player-2', teamSide: 'B' },
      ]),
    ).toEqual([
      { playerId: 'player-1', teamSide: 'A', deviceKind: 'keyboard' },
      {
        playerId: 'player-2',
        teamSide: 'B',
        deviceKind: 'gamepad',
        gamepadSlot: 0,
      },
    ])
  })

  it('supports four local players with unique logical devices', () => {
    const bindings = createPreviewInputBindings([
      { playerId: 'player-1', teamSide: 'A' },
      { playerId: 'player-2', teamSide: 'B' },
      { playerId: 'player-3', teamSide: 'A' },
      { playerId: 'player-4', teamSide: 'B' },
    ])

    expect(bindings).toHaveLength(4)
    expect(bindings.map((binding) => binding.deviceKind)).toEqual([
      'keyboard',
      'gamepad',
      'gamepad',
      'gamepad',
    ])
  })

  it.each([
    [[] as LocalInputBinding[]],
    [FIVE_LOCAL_INPUT_BINDINGS],
  ])('rejects a local player count outside 1 through 4', (bindings) => {
    expect(() => validateLocalInputBindings(bindings)).toThrow(RangeError)
  })

  it('rejects duplicate keyboard and gamepad bindings', () => {
    expect(() =>
      validateLocalInputBindings([
        KEYBOARD_BINDING,
        { ...KEYBOARD_BINDING, playerId: 'player-2', teamSide: 'B' },
      ]),
    ).toThrow('Only one logical keyboard')

    expect(() =>
      validateLocalInputBindings([
        {
          playerId: 'player-1',
          teamSide: 'A',
          deviceKind: 'gamepad',
          gamepadSlot: 0,
        },
        {
          playerId: 'player-2',
          teamSide: 'B',
          deviceKind: 'gamepad',
          gamepadSlot: 0,
        },
      ]),
    ).toThrow('Duplicate gamepad slot')
  })
})
