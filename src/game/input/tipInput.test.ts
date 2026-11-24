import { describe, expect, it, vi } from 'vitest'
import { createFrameActionIntents } from '@/game/actions/actionIntegrationBridge'
import { createTipIntent } from '@/game/actions/tipIntent'
import { LOCAL_INPUT_CONFIG } from '@/game/input/inputConfig'
import { LocalInputManager } from '@/game/input/LocalInputManager'
import type { LocalInputBinding } from '@/game/input/inputTypes'
import { SceneFixedStepRunner } from '@/game/scene/SceneFixedStepRunner'

const STEP = 1 / 60
const keyboard = { playerId: 'a', teamSide: 'A', deviceKind: 'keyboard' } as const
const pad = { playerId: 'b', teamSide: 'B', deviceKind: 'gamepad', gamepadSlot: 0 } as const
const players = [
  { ...keyboard, position: { x: 0, y: 0, z: -4 } },
  { ...pad, position: { x: 0, y: 0, z: 4 } },
]
const distantBall = () => ({ position: { x: 0, y: 3, z: 0 }, velocity: { x: 0, y: 0, z: 0 } })
const key = (type: 'keydown' | 'keyup', code: string, repeat = false) =>
  window.dispatchEvent(new KeyboardEvent(type, { code, repeat, cancelable: true }))

function gamepad({
  index = 0, name = 'TIP test pad', value = 0, pressed = false, spike = false, axes = [1, 0],
}: { index?: number; name?: string; value?: number; pressed?: boolean; spike?: boolean; axes?: number[] } = {}): Gamepad {
  return {
    index, id: name, connected: true, mapping: 'standard', timestamp: 0, axes,
    vibrationActuator: { playEffect: async () => 'complete', reset: async () => 'complete' },
    buttons: Array.from({ length: 6 }, (_, button) => ({
      pressed: button === 5 ? pressed : button === 3 && spike,
      touched: button === 5 || button === 3,
      value: button === 5 ? value : button === 3 && spike ? 1 : 0,
    })),
  }
}

function withManager(bindings: readonly LocalInputBinding[], test: (manager: LocalInputManager) => void) {
  const manager = new LocalInputManager(bindings)
  manager.start()
  try { test(manager) } finally { manager.dispose() }
}

describe('TIP input and lifecycle', () => {
  it('adds T and button 5 without changing previous mappings or deadzone', () => {
    expect(LOCAL_INPUT_CONFIG.keyboardCodes).toEqual({
      forward: 'KeyW', backward: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space',
      hit: 'KeyE', forearmPass: 'KeyQ', set: 'KeyR', spike: 'KeyF', tip: 'KeyT',
    })
    expect(LOCAL_INPUT_CONFIG.gamepadButtons).toEqual({ jump: 0, hit: 1, set: 2, spike: 3, forearmPass: 4, tip: 5 })
    expect(LOCAL_INPUT_CONFIG.gamepadDeadzone).toBe(0.15)
  })

  it('captures a complete T tap between polls and freezes the aim at keydown', () => {
    withManager([keyboard], (manager) => {
      key('keydown', 'KeyA')
      key('keydown', 'KeyT')
      key('keyup', 'KeyA')
      key('keydown', 'KeyW')
      key('keyup', 'KeyT')
      const first = manager.update()[0]
      expect(first).toMatchObject({ tipHeld: false, tipPressed: true, localMove: { lateral: 0, forward: 1 } })
      expect(first.tipPressAim).toEqual({ lateral: -1, forward: 0 })
      expect(Object.isFrozen(first.tipPressAim)).toBe(true)
      expect(createTipIntent(first)).toMatchObject({ aimLateral: -1, aimForward: 0 })
      expect(manager.update()[0]).toMatchObject({ tipHeld: false, tipPressed: false })
    })
  })

  it('ignores T repeat and held polls, but captures a new press after release', () => {
    withManager([keyboard], (manager) => {
      key('keydown', 'KeyT')
      expect(manager.update()[0]).toMatchObject({ tipHeld: true, tipPressed: true })
      key('keydown', 'KeyT', true)
      key('keydown', 'KeyT')
      expect(manager.update()[0]).toMatchObject({ tipHeld: true, tipPressed: false })
      key('keyup', 'KeyT')
      expect(manager.update()[0]).toMatchObject({ tipHeld: false, tipPressed: false })
      key('keydown', 'KeyT')
      expect(manager.update()[0].tipPressed).toBe(true)
    })
  })

  it('keeps TIP and SPIKE capture aims independent on the same input sample', () => {
    withManager([keyboard], (manager) => {
      key('keydown', 'KeyA')
      key('keydown', 'KeyT')
      key('keyup', 'KeyA')
      key('keydown', 'KeyD')
      key('keydown', 'KeyF')
      const first = manager.update()[0]
      expect(first).toMatchObject({ tipPressed: true, spikePressed: true })
      expect(createFrameActionIntents([first])).toMatchObject([
        { actionType: 'SPIKE', aimLateral: 1 },
        { actionType: 'TIP', aimLateral: -1 },
      ])
      expect(manager.update()[0]).toMatchObject({ tipPressed: false, spikePressed: false })
    })
  })

  it('uses the last T press before polling without replacing a captured F aim', () => {
    withManager([keyboard], (manager) => {
      key('keydown', 'KeyA')
      key('keydown', 'KeyT')
      key('keydown', 'KeyF')
      key('keyup', 'KeyT')
      key('keyup', 'KeyA')
      key('keydown', 'KeyD')
      key('keydown', 'KeyT')
      const first = manager.update()[0]
      expect(first.tipPressAim).toEqual({ lateral: 1, forward: 0 })
      expect(first.spikePressAim).toEqual({ lateral: -1, forward: 0 })
    })
  })

  it('retains T through a zero-tick frame without rearming on multiple executed ticks', () => {
    withManager([keyboard], (manager) => {
      const runner = new SceneFixedStepRunner([players[0]], distantBall)
      key('keydown', 'KeyD')
      key('keydown', 'KeyT')
      runner.queueInput(manager.update())
      expect(runner.advanceFrame(STEP / 2).ticks).toEqual([])
      key('keyup', 'KeyD')
      key('keyup', 'KeyT')
      key('keydown', 'KeyA')
      runner.queueInput(manager.update())
      const ticks = runner.advanceFrame(2.5 * STEP).ticks
      expect(ticks.map(({ actionStep }) => actionStep.selectedActions[0]?.pressStep)).toEqual([0, 0, 0])
      expect(ticks[0].actionStep.selectedActions[0]).toMatchObject({ actionType: 'TIP', aimLateral: 1 })
      expect(runner.advanceFrame(4 * STEP).ticks.at(-1)?.actionStep.selectedActions).toEqual([])
    })
  })

  it('clears unsampled T and queued TIP on blur and ignores repeat during focus recovery', () => {
    withManager([keyboard], (manager) => {
      const runner = new SceneFixedStepRunner([players[0]], distantBall)
      const clear = () => runner.clearInput()
      const resample = () => { manager.update() }
      window.addEventListener('blur', clear)
      window.addEventListener('focus', resample)
      try {
        key('keydown', 'KeyT')
        runner.queueInput(manager.update())
        runner.advanceFrame(STEP / 2)
        key('keyup', 'KeyT')
        key('keydown', 'KeyT')
        window.dispatchEvent(new Event('blur'))
        key('keydown', 'KeyT', true)
        window.dispatchEvent(new Event('focus'))
        const resumed = manager.update()[0]
        expect(resumed).toMatchObject({ tipHeld: false, tipPressed: false, tipPressAim: undefined })
        runner.queueInput([resumed])
        expect(runner.advanceFrame(STEP / 2).ticks[0].actionStep.selectedActions).toEqual([])
        key('keyup', 'KeyT')
        key('keydown', 'KeyT')
        expect(manager.update()[0].tipPressed).toBe(true)
      } finally {
        window.removeEventListener('blur', clear)
        window.removeEventListener('focus', resample)
      }
    })
  })

  it('disposes T state and does not duplicate keyboard handlers on restart', () => {
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')
    const manager = new LocalInputManager([keyboard])
    try {
      manager.start()
      manager.start()
      key('keydown', 'KeyT')
      manager.dispose()
      expect(manager.getSnapshots()[0]).toMatchObject({ tipHeld: false, tipPressed: false, tipPressAim: undefined })
      manager.start()
      key('keydown', 'KeyT')
      expect(manager.update()[0].tipPressed).toBe(true)
      expect(add.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(2)
      expect(remove.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(1)
    } finally {
      manager.dispose()
      add.mockRestore()
      remove.mockRestore()
    }
  })

  it('captures button 5 with the existing threshold and freezes the polled local aim', () => {
    let current = gamepad()
    const manager = new LocalInputManager([pad], { gamepadProvider: () => [current] })
    try {
      manager.update()
      current = gamepad({ value: 0.5 })
      expect(manager.update()[0]).toMatchObject({ tipHeld: false, tipPressed: false })
      current = gamepad({ value: 0.50001 })
      const first = manager.update()[0]
      expect(first).toMatchObject({ tipHeld: true, tipPressed: true, worldMove: { worldX: -1, worldZ: 0 } })
      expect(first.tipPressAim).toEqual({ lateral: 1, forward: -0 })
      expect(Object.isFrozen(first.tipPressAim)).toBe(true)
      first.localMove.lateral = -1
      expect(createTipIntent(first)).toMatchObject({ aimLateral: 1, aimForward: -0 })
      expect(manager.update()[0].tipPressed).toBe(false)
      current = gamepad()
      manager.update()
      current = gamepad({ pressed: true })
      expect(manager.update()[0].tipPressed).toBe(true)
    } finally { manager.dispose() }
  })

  it('preserves radial deadzone behavior and treats a missing button 5 as neutral', () => {
    let current = gamepad({ axes: [0.1, 0.1] })
    const manager = new LocalInputManager([pad], { gamepadProvider: () => [current] })
    try {
      manager.update()
      current = gamepad({ pressed: true, axes: [0.1, 0.1] })
      expect(createTipIntent(manager.update()[0])).toMatchObject({ aimLateral: 0, aimForward: 0 })
      current = { ...gamepad(), buttons: [] }
      expect(manager.update()[0]).toMatchObject({ tipHeld: false, tipPressed: false })
    } finally { manager.dispose() }
  })

  it('isolates simultaneous TIP and SPIKE edges across keyboard and gamepad players', () => {
    let current = gamepad()
    const manager = new LocalInputManager([keyboard, pad], { gamepadProvider: () => [current] })
    manager.start()
    try {
      manager.update()
      key('keydown', 'KeyT')
      key('keydown', 'KeyF')
      current = gamepad({ pressed: true, spike: true, axes: [-1, 0] })
      const first = manager.update()
      expect(first.map(x => [x.playerId, x.tipPressed, x.spikePressed])).toEqual([['a', true, true], ['b', true, true]])
      expect(first.map(createTipIntent)).toMatchObject([
        { playerId: 'a', teamSide: 'A', aimLateral: 0 },
        { playerId: 'b', teamSide: 'B', aimLateral: -1 },
      ])
    } finally { manager.dispose() }
  })

  it('suppresses held TIP on reconnect, identity changes and focus baseline sampling', () => {
    let current: (Gamepad | null)[] = [gamepad({ pressed: true })]
    const manager = new LocalInputManager([pad], { gamepadProvider: () => current })
    const update = () => manager.update()[0]
    try {
      expect(update()).toMatchObject({ tipHeld: true, tipPressed: false })
      current = []
      expect(update()).toMatchObject({ deviceConnected: false, tipHeld: false, tipPressed: false })
      current = [null, gamepad({ index: 1, pressed: true })]
      expect(update()).toMatchObject({ tipHeld: true, tipPressed: false })
      current = [null, gamepad({ index: 1, name: 'replacement', pressed: true })]
      expect(update()).toMatchObject({ tipHeld: true, tipPressed: false })
      current = [null, gamepad({ index: 1, name: 'replacement' })]
      update()
      current = [null, gamepad({ index: 1, name: 'replacement', pressed: true })]
      update() // Existing focus callback takes and discards the baseline sample.
      expect(update().tipPressed).toBe(false)
    } finally { manager.dispose() }
  })

  it('clears disconnected gamepad TIP without removing the keyboard player capture', () => {
    let current: (Gamepad | null)[] = [gamepad()]
    const manager = new LocalInputManager([keyboard, pad], { gamepadProvider: () => current })
    const runner = new SceneFixedStepRunner(players, distantBall)
    manager.start()
    try {
      runner.queueInput(manager.update())
      key('keydown', 'KeyT')
      current = [gamepad({ pressed: true })]
      runner.queueInput(manager.update())
      expect(runner.advanceFrame(STEP).ticks[0].actionStep.selectedActions.map(x => x.playerId)).toEqual(['a', 'b'])
      current = []
      runner.queueInput(manager.update())
      expect(runner.advanceFrame(STEP).ticks[0].actionStep.selectedActions.map(x => x.playerId)).toEqual(['a'])
    } finally { manager.dispose() }
  })
})
