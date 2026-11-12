import { describe, expect, it } from 'vitest'
import { createFrameActionIntents } from '@/game/actions/actionIntegrationBridge'
import { LocalInputManager } from '@/game/input/LocalInputManager'
import type { LocalInputBinding } from '@/game/input/inputTypes'
import { SceneFixedStepRunner } from '@/game/scene/SceneFixedStepRunner'

const STEP = 1 / 60
const keyboard = { playerId: 'a', teamSide: 'A', deviceKind: 'keyboard' } as const
const pad = { playerId: 'b', teamSide: 'B', deviceKind: 'gamepad', gamepadSlot: 0 } as const
const distantBall = () => ({ position: { x: 0, y: 3, z: 0 }, velocity: { x: 0, y: 0, z: 0 } })
const players = [
  { ...keyboard, position: { x: 0, y: 0, z: -4 } },
  { ...pad, position: { x: 0, y: 0, z: 4 } },
]
const key = (type: 'keydown' | 'keyup', code: string, repeat = false) =>
  window.dispatchEvent(new KeyboardEvent(type, { code, repeat, cancelable: true }))

function gamepad(index: number, value = 0, pressed = false): Gamepad {
  return {
    index, id: 'test pad', connected: true, mapping: 'standard', timestamp: 0,
    axes: [1, 0],
    vibrationActuator: { playEffect: async () => 'complete', reset: async () => 'complete' },
    buttons: Array.from({ length: 5 }, (_, button) => ({
      pressed: button === 3 && pressed, touched: button === 3, value: button === 3 ? value : 0,
    })),
  }
}

function withManager(bindings: readonly LocalInputBinding[], test: (manager: LocalInputManager) => void) {
  const manager = new LocalInputManager(bindings)
  manager.start()
  try { test(manager) } finally { manager.dispose() }
}

describe('SPIKE input through the existing capture and scene queue', () => {
  it('captures F on keydown, freezes its aim, and handles release and re-press before sampling', () => {
    withManager([keyboard], (manager) => {
      key('keydown', 'KeyA')
      key('keydown', 'KeyF')
      key('keyup', 'KeyA')
      key('keydown', 'KeyW')
      key('keyup', 'KeyF')
      const first = manager.update()[0]
      expect(first).toMatchObject({ spikePressed: true, spikeHeld: false, localMove: { lateral: 0, forward: 1 } })
      expect(createFrameActionIntents([first])).toEqual([
        { playerId: 'a', teamSide: 'A', actionType: 'SPIKE', spikePressed: true, aimLateral: -1, aimForward: 0 },
      ])
      expect(manager.update()[0].spikePressed).toBe(false)
      key('keydown', 'KeyF')
      expect(manager.update()[0]).toMatchObject({ spikePressed: true, spikeHeld: true })
      key('keydown', 'KeyF', true)
      expect(manager.update()[0]).toMatchObject({ spikePressed: false, spikeHeld: true })
      key('keyup', 'KeyF')
      expect(manager.update()[0]).toMatchObject({ spikePressed: false, spikeHeld: false })
    })
  })

  it('retains a captured F edge over a no-tick frame and never captures it again on a multi-tick frame', () => {
    withManager([keyboard], (manager) => {
      const runner = new SceneFixedStepRunner([players[0]], distantBall)
      key('keydown', 'KeyD')
      key('keydown', 'KeyF')
      runner.queueInput(manager.update())
      expect(runner.advanceFrame(STEP / 2).ticks).toEqual([])
      key('keyup', 'KeyD')
      key('keydown', 'KeyA')
      runner.queueInput(manager.update())
      const frame = runner.advanceFrame(2.5 * STEP)
      expect(frame.ticks.map(({ actionStep }) => actionStep.selectedActions[0]?.pressStep)).toEqual([0, 0, 0])
      expect(frame.ticks[0].actionStep.selectedActions[0]?.aimLateral).toBe(1)
      expect(frame.ticks[0].contactPoses[0].position.x).toBeLessThan(0)
      expect(runner.advanceFrame(4 * STEP).ticks.at(-1)?.actionStep.selectedActions).toEqual([])
    })
  })

  it('clears the source and scene queues on blur, including held-key repeat, and resumes on a new press', () => {
    withManager([keyboard], (manager) => {
      const runner = new SceneFixedStepRunner([players[0]], distantBall)
      const onBlur = () => runner.clearInput()
      const onFocus = () => { manager.update() }
      window.addEventListener('blur', onBlur)
      window.addEventListener('focus', onFocus)
      try {
        key('keydown', 'KeyF')
        runner.queueInput(manager.update())
        runner.advanceFrame(STEP / 2)
        key('keyup', 'KeyF')
        key('keydown', 'KeyF')
        window.dispatchEvent(new Event('blur'))
        key('keydown', 'KeyF', true)
        window.dispatchEvent(new Event('focus'))
        const afterFocus = manager.update()[0]
        expect(afterFocus).toMatchObject({ spikePressed: false, spikeHeld: false })
        runner.queueInput([afterFocus])
        expect(runner.advanceFrame(STEP / 2).ticks[0].actionStep.selectedActions).toEqual([])
        key('keyup', 'KeyF')
        key('keydown', 'KeyF')
        runner.queueInput(manager.update())
        expect(runner.advanceFrame(STEP).ticks[0].actionStep.selectedActions[0]?.actionType).toBe('SPIKE')
      } finally {
        window.removeEventListener('blur', onBlur)
        window.removeEventListener('focus', onFocus)
      }
    })
  })

  it('disposes held state and a keydown that was never sampled', () => {
    const manager = new LocalInputManager([keyboard])
    manager.start()
    key('keydown', 'KeyF')
    expect(manager.update()[0].spikePressed).toBe(true)
    key('keyup', 'KeyF')
    key('keydown', 'KeyF')
    manager.dispose()
    expect(manager.getSnapshots()[0]).toMatchObject({ spikeHeld: false, spikePressed: false })
    expect(manager.update()[0]).toMatchObject({ spikeHeld: false, spikePressed: false })
  })

  it('samples button 3, applies the analog threshold and isolates player and aim', () => {
    let current = gamepad(0)
    const manager = new LocalInputManager([keyboard, pad], { gamepadProvider: () => [current] })
    manager.start()
    try {
      manager.update()
      current = gamepad(0, 0.5)
      expect(manager.update()[1]).toMatchObject({ spikeHeld: false, spikePressed: false })
      current = gamepad(0, 0.50001)
      key('keydown', 'KeyF')
      const snapshots = manager.update()
      expect(snapshots.map((snapshot) => [snapshot.spikePressed, snapshot.spikeHeld])).toEqual([[true, true], [true, true]])
      expect(createFrameActionIntents(snapshots)).toMatchObject([
        { playerId: 'a', teamSide: 'A', actionType: 'SPIKE', aimLateral: 0 },
        { playerId: 'b', teamSide: 'B', actionType: 'SPIKE', aimLateral: 1 },
      ])
      expect(manager.update().every(({ spikePressed }) => !spikePressed)).toBe(true)
      current = gamepad(0)
      expect(manager.update()[1].spikeHeld).toBe(false)
      current = gamepad(0, 0, true)
      expect(manager.update()[1]).toMatchObject({ spikeHeld: true, spikePressed: true })
    } finally {
      manager.dispose()
    }
  })

  it('suppresses held F-equivalent input on device remapping, focus resampling and reconnect', () => {
    let current: (Gamepad | null)[] = [gamepad(0, 1)]
    const manager = new LocalInputManager([pad], { gamepadProvider: () => current })
    const update = () => manager.update()[0]
    expect(update()).toMatchObject({ spikeHeld: true, spikePressed: false })
    current = [gamepad(0), gamepad(1, 1)]
    expect(update().spikeHeld).toBe(false)
    current = [null, gamepad(1, 1)]
    expect(update()).toMatchObject({ spikeHeld: true, spikePressed: false })
    current = []
    expect(update()).toMatchObject({ deviceConnected: false, spikeHeld: false, spikePressed: false })
    current = [null, gamepad(1, 1)]
    expect(update()).toMatchObject({ deviceConnected: true, spikeHeld: true, spikePressed: false })
    current = [null, gamepad(1)]
    update()
    current = [null, gamepad(1, 1)]
    update() // Focus takes a baseline sample before accepting edges again.
    expect(update().spikePressed).toBe(false)
    manager.dispose()
  })

  it('clears a buffered spike on disconnect without affecting the keyboard player', () => {
    let current: (Gamepad | null)[] = [gamepad(0)]
    const manager = new LocalInputManager([keyboard, pad], { gamepadProvider: () => current })
    const runner = new SceneFixedStepRunner(players, distantBall)
    manager.start()
    try {
      runner.queueInput(manager.update())
      key('keydown', 'KeyF')
      current = [gamepad(0, 1)]
      runner.queueInput(manager.update())
      expect(runner.advanceFrame(STEP).ticks[0].actionStep.selectedActions.map(({ playerId }) => playerId))
        .toEqual(['a', 'b'])
      current = []
      runner.queueInput(manager.update())
      expect(runner.advanceFrame(STEP).ticks[0].actionStep.selectedActions.map(({ playerId }) => playerId))
        .toEqual(['a'])
    } finally {
      manager.dispose()
    }
  })
})
