import { describe, expect, it } from 'vitest'
import { FixedStepVolleyballSimulator } from '@/game/ball/FixedStepVolleyballSimulator'
import { VOLLEYBALL_CONFIG } from '@/game/ball/volleyballConfig'
import { VOLLEYBALL_SIMULATION_CONFIG } from '@/game/ball/volleyballSimulationConfig'
import type { VolleyballState } from '@/game/ball/volleyballState'
import { isBallOverlappingPlayer } from '@/game/contact/playerBallContact'
import { localMoveToWorld, normalizeMove2D } from '@/game/input/inputMath'
import { LocalInputManager } from '@/game/input/LocalInputManager'
import type { LocalPlayerInputSnapshot } from '@/game/input/inputTypes'
import { PlayerMovementController } from '@/game/movement/PlayerMovementController'
import { INDOOR_PLAYER_SPAWNS } from '@/game/player/indoorPlayerSpawns'
import { SceneFixedStepRunner, type SceneTickResult } from './SceneFixedStepRunner'

const STEP = 1 / 60
const A = INDOOR_PLAYER_SPAWNS[0]
const B = INDOOR_PLAYER_SPAWNS[1]
const rates = [30, 60, 120]

function snapshot(
  player = A,
  flags: Partial<LocalPlayerInputSnapshot> = {},
  lateral = 0,
  forward = 0,
): LocalPlayerInputSnapshot {
  const localMove = normalizeMove2D({ lateral, forward })
  return {
    playerId: player.playerId,
    teamSide: player.teamSide,
    deviceKind: player === B ? 'gamepad' : 'keyboard',
    deviceName: 'Test input',
    deviceConnected: true,
    localMove,
    worldMove: localMoveToWorld(player.teamSide, localMove),
    jumpHeld: false,
    jumpPressed: false,
    hitHeld: false,
    hitPressed: false,
    forearmPassHeld: false,
    forearmPassPressed: false,
    setHeld: false,
    setPressed: false,
    ...flags,
  }
}

function ballAt(y = 1, z = -1): VolleyballState {
  return {
    position: { x: 0, y, z },
    velocity: { x: 0, y: 0, z: 0 },
  }
}

const contactPlayer = { ...A, position: { x: 0, y: 0, z: -1 } }

function trace(runner: SceneFixedStepRunner, fps: number, seconds: number): SceneTickResult[] {
  const ticks: SceneTickResult[] = []
  for (let frame = 0; frame < fps * seconds; frame += 1) {
    ticks.push(...runner.advanceFrame(1 / fps).ticks)
  }
  return ticks
}

describe('SceneFixedStepRunner clock and movement', () => {
  it('retains an edge and residual time across zero-step, invalid and clamped frames', () => {
    const runner = new SceneFixedStepRunner([A], () => ballAt(10))
    runner.queueInput([snapshot(A, { jumpPressed: true, jumpHeld: true }, 1)])
    expect(runner.advanceFrame(STEP / 2).ticks).toEqual([])
    for (const invalid of [0, -1, NaN, Infinity, -Infinity]) {
      expect(runner.advanceFrame(invalid).ticks).toEqual([])
      expect(runner.accumulatorSeconds).toBe(STEP / 2)
    }

    const frame = runner.advanceFrame(5)
    expect(VOLLEYBALL_SIMULATION_CONFIG).toMatchObject({
      fixedStepSeconds: STEP, maxFrameDeltaSeconds: 0.1, maxSubSteps: 8,
    })
    expect(frame.ticks.map(({ sceneTick }) => sceneTick)).toEqual([0, 1, 2, 3, 4, 5])
    expect(frame.ticks[0].contactPoses[0]).toMatchObject({ grounded: false })
    expect(frame.ticks[0].contactPoses[0].verticalVelocity)
      .toBeGreaterThan(frame.ticks[1].contactPoses[0].verticalVelocity)
    expect(frame.playerPoses[0].position.x).toBeCloseTo(0.45, 12)
    expect(runner.accumulatorSeconds).toBeCloseTo(STEP / 2, 12)
    expect(runner.advanceFrame(STEP / 2).ticks.map(({ sceneTick }) => sceneTick)).toEqual([6])
    expect(runner.accumulatorSeconds).toBe(0)
  })

  it('carries a backlog to the next frame when the substep cap is reached', () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      VOLLEYBALL_SIMULATION_CONFIG, 'maxFrameDeltaSeconds',
    )!
    // The production clamp accepts only six ticks of new time. Exercise the
    // eight-tick cap with a larger input to verify that the excess is retained.
    Object.defineProperty(VOLLEYBALL_SIMULATION_CONFIG, 'maxFrameDeltaSeconds', { value: 12 * STEP })
    try {
      const runner = new SceneFixedStepRunner([A], () => ballAt(10))
      expect(runner.advanceFrame(12 * STEP).ticks).toHaveLength(8)
      expect(runner.accumulatorSeconds).toBeCloseTo(4 * STEP, 12)
      expect(runner.advanceFrame(STEP).ticks.map(({ sceneTick }) => sceneTick)).toEqual([
        8, 9, 10, 11, 12,
      ])
      expect(runner.accumulatorSeconds).toBe(0)
    } finally {
      Object.defineProperty(VOLLEYBALL_SIMULATION_CONFIG, 'maxFrameDeltaSeconds', descriptor)
    }
  })

  it('uses the most recent held movement, applies mirrored diagonals and respects the court limits', () => {
    const runner = new SceneFixedStepRunner([A, B], () => ballAt(10))
    runner.queueInput([snapshot(A, {}, -1), snapshot(B, {}, 1, 1)])
    runner.advanceFrame(STEP / 2)
    runner.queueInput([snapshot(A, {}, 1, 1)])
    const { playerPoses: [a, b] } = runner.advanceFrame(STEP / 2)
    const diagonalDelta = 4.5 * STEP * Math.SQRT1_2
    expect(a.position.x).toBeCloseTo(diagonalDelta, 12)
    expect(a.position.z).toBeCloseTo(A.position.z + diagonalDelta, 12)
    expect(b.position.x).toBeCloseTo(-diagonalDelta, 12)
    expect(b.position.z).toBeCloseTo(B.position.z - diagonalDelta, 12)

    const bounds = new SceneFixedStepRunner([
      { ...A, position: { x: 7.2, y: 0, z: -0.3 } },
      { ...B, position: { x: -7.2, y: 0, z: 0.3 } },
    ], () => ballAt(10))
    bounds.queueInput([snapshot(A, {}, 1, 1), snapshot(B, {}, 1, 1)])
    expect(bounds.advanceFrame(2 * STEP).playerPoses.map(({ position }) => position)).toEqual([
      { x: 7.22, y: 0, z: -0.28 }, { x: -7.22, y: 0, z: 0.28 },
    ])
  })

  it('moves on WASD and keeps Space held through landing until a new keydown', () => {
    const keyboard = new EventTarget()
    const manager = new LocalInputManager([{ playerId: A.playerId, teamSide: 'A', deviceKind: 'keyboard' }], {
      keyboardTarget: keyboard as Window,
    })
    const runner = new SceneFixedStepRunner([A], () => ballAt(10))
    const key = (type: string, code: string) => keyboard.dispatchEvent(Object.assign(
      new Event(type, { cancelable: true }), { code },
    ))
    manager.start()
    try {
      for (const [code, axis, direction] of [
        ['KeyW', 'z', 1], ['KeyS', 'z', -1], ['KeyA', 'x', -1], ['KeyD', 'x', 1],
      ] as const) {
        const before = runner.advanceFrame(0).playerPoses[0].position
        key('keydown', code)
        runner.queueInput(manager.update())
        const after = runner.advanceFrame(STEP).playerPoses[0].position
        expect(after[axis] - before[axis]).toBeCloseTo(direction * 4.5 * STEP, 12)
        key('keyup', code)
      }

      key('keydown', 'Space')
      runner.queueInput(manager.update())
      expect(runner.advanceFrame(STEP / 2).ticks).toEqual([])
      runner.queueInput(manager.update())
      const launch = runner.advanceFrame(STEP / 2).playerPoses[0]
      expect(launch.grounded).toBe(false)
      expect(launch.verticalVelocity).toBeGreaterThan(0)
      const jump = trace(runner, 60, 1).map(({ contactPoses }) => contactPoses[0])
      expect(Math.max(...jump.map(({ position }) => position.y))).toBeCloseTo(0.85, 3)
      expect(jump[25].verticalVelocity).toBeLessThan(0)
      runner.queueInput(manager.update())
      expect(runner.advanceFrame(STEP).playerPoses[0]).toMatchObject({
        grounded: true, verticalVelocity: 0, position: { y: 0 },
      })
      key('keyup', 'Space')
      runner.queueInput(manager.update())
      key('keydown', 'Space')
      runner.queueInput(manager.update())
      expect(runner.advanceFrame(STEP).playerPoses[0].grounded).toBe(false)
    } finally {
      manager.dispose()
    }
  })

  it('reproduces the old frame-sampled landing at step 48 and makes the fixed pose identical', () => {
    const jump = snapshot(B, { jumpPressed: true })
    const oldLandings = rates.map((fps) => {
      const target = { ...B, position: { ...B.position } }
      const movement = new PlayerMovementController([target])
      const ball = new FixedStepVolleyballSimulator(ballAt(10))
      const oldTrace = []
      for (let frame = 0; frame < fps; frame += 1) {
        movement.update([frame === 0 ? jump : snapshot(B)], 1 / fps)
        for (const actionStep of ball.advanceWithActions(1 / fps, [target]).actionSteps) {
          oldTrace.push({
            step: actionStep.simulationStep,
            y: target.position.y,
            grounded: movement.getPlayerState(B.playerId)?.grounded,
          })
        }
      }
      return oldTrace[48]
    })
    expect(oldLandings.map(({ step, grounded }) => [step, grounded])).toEqual([
      [48, true], [48, false], [48, false],
    ])

    const fixedTraces = rates.map((fps) => {
      const runner = new SceneFixedStepRunner([B], () => ballAt(10))
      runner.queueInput([jump])
      return trace(runner, fps, 1)
    })
    expect(fixedTraces[0]).toEqual(fixedTraces[1])
    expect(fixedTraces[2]).toEqual(fixedTraces[1])
    const fixedLanding = fixedTraces[1][48].contactPoses[0]
    expect(fixedLanding.position.y).toBeCloseTo(oldLandings[1].y, 12)
    expect(fixedTraces[1][49].contactPoses[0].grounded).toBe(true)
  })
})

describe('SceneFixedStepRunner action transport and contact order', () => {
  it.each([
    ['hitPressed', 'GENERIC_HIT', 'PLAYER_CONTACT_RESPONSE'],
    ['forearmPassPressed', 'FOREARM_PASS', 'PLAYER_FOREARM_PASS_RESPONSE'],
    ['setPressed', 'SET', 'PLAYER_SET_RESPONSE'],
  ] as const)('delivers %s once after a zero-step frame and freezes capture aim', (edge, actionType, eventType) => {
    const runner = new SceneFixedStepRunner([contactPlayer], ballAt)
    const pressed = snapshot(A, { [edge]: true }, 0.25, -0.5)
    runner.queueInput([pressed])
    expect(runner.advanceFrame(STEP / 2).ticks).toEqual([])
    pressed.localMove.lateral = 1
    runner.queueInput([snapshot(A, {}, -0.25, 0.5)])

    const { ticks } = runner.advanceFrame(1.5 * STEP)
    expect(ticks).toHaveLength(2)
    const [first, second] = ticks
    expect(first.events.map(({ type }) => type)).toEqual(['PLAYER_CONTACT', eventType])
    expect(first.events[1]).toMatchObject({ outgoingVelocity: first.ballState.velocity })
    expect(first.actionStep.executedAction).toMatchObject({
      action: { actionType, pressStep: 0, aimLateral: 0.25, aimForward: -0.5 },
      responseStep: 0,
      outgoingVelocity: first.ballState.velocity,
    })
    expect(second.events).toEqual([])
    expect(second.actionStep.selectedActions).toEqual([])
  })

  it('takes a new immutable pose for each substep and contacts at the second pose', () => {
    const player = { ...contactPlayer, position: { ...contactPlayer.position, x: 0.48 } }
    const runner = new SceneFixedStepRunner([player], ballAt)
    runner.queueInput([snapshot(A, { hitPressed: true }, -1)])
    const { ticks: [first, second] } = runner.advanceFrame(2 * STEP)
    const [pose1, pose2] = [first.contactPoses[0], second.contactPoses[0]]
    expect(pose1.position.x).toBeCloseTo(0.405, 12)
    expect(pose2.position.x).toBeCloseTo(0.33, 12)
    expect(first.events).toEqual([])
    expect(second.events.map(({ type }) => type)).toEqual(['PLAYER_CONTACT', 'PLAYER_CONTACT_RESPONSE'])
    expect(second.events[0]).toMatchObject({ playerPosition: pose2.position })
    expect(second.events[1]).toMatchObject({ hitTimingOffsetSteps: -1, hitTimingGrade: 'EARLY' })
    expect(second.actionStep.executedAction).toMatchObject({
      action: { pressStep: 0 }, responseStep: 1,
    })

    const oldTarget = { ...player, position: { ...player.position } }
    const oldMovement = new PlayerMovementController([oldTarget])
    oldMovement.update([snapshot(A, {}, -1)], 2 * STEP)
    const oldBall = new FixedStepVolleyballSimulator(ballAt())
    const oldFrame = oldBall.advanceWithActions(2 * STEP, [oldTarget], [
      { playerId: A.playerId, actionType: 'GENERIC_HIT', hitHeld: true, hitPressed: true, aimLateral: -1, aimForward: 0 },
    ])
    expect(oldFrame.actionSteps[0].executedAction?.responseStep).toBe(0)

    player.position.x = 3
    runner.advanceFrame(STEP)
    expect(pose1.position.x).toBeCloseTo(0.405, 12)
    expect(Object.isFrozen(first.contactPoses)).toBe(true)
    expect(Object.isFrozen(pose1)).toBe(true)
    expect(Object.isFrozen(pose1.position)).toBe(true)
  })

  it('keeps replacement order and all three priority candidates through exit and reentry', () => {
    const player = { ...contactPlayer, position: { ...contactPlayer.position, x: 0.37 } }
    const runner = new SceneFixedStepRunner([player], ballAt)
    runner.queueInput([snapshot(A, { hitPressed: true, forearmPassPressed: true, setPressed: true })])
    runner.queueInput([snapshot(A, { hitPressed: true }, -0.5)])
    runner.queueInput([snapshot()])
    runner.queueInput([snapshot(A, { setPressed: true })], 1)
    runner.queueInput([snapshot(A, {}, 1)], 2)
    runner.queueInput([snapshot(A, {}, -1)], 3)
    runner.queueInput([snapshot(A, {}, 1)], 4)
    runner.queueInput([snapshot(A, {}, -1)], 5)
    const { ticks } = runner.advanceFrame(6 * STEP)
    expect(ticks.map(({ actionStep }) => actionStep.selectedActions[0]?.actionType)).toEqual([
      'SET', 'FOREARM_PASS', 'FOREARM_PASS', 'FOREARM_PASS', 'GENERIC_HIT', 'GENERIC_HIT',
    ])
    expect(ticks.map(({ events }) => events.map(({ type }) => type))).toEqual([
      ['PLAYER_CONTACT', 'PLAYER_SET_RESPONSE'], [], [],
      ['PLAYER_CONTACT', 'PLAYER_FOREARM_PASS_RESPONSE'], [], [],
    ])
    expect(ticks[5].actionStep.selectedActions).toMatchObject([
      { actionType: 'GENERIC_HIT', aimLateral: -0.5, pressStep: 0 },
    ])
    expect(ticks[3].events[1]).toMatchObject({ pressStep: 0, contactStep: 3 })
  })

  it('keeps the oldest valid press ahead of a newer action and preserves contact target order', () => {
    const first = { ...B, position: { x: 0.48, y: 0, z: 0.28 } }
    const second = { ...A, position: { x: 0.48, y: 0, z: -0.28 } }
    const runner = new SceneFixedStepRunner([first, second], () => ballAt(1, 0))
    runner.queueInput([snapshot(B, { hitPressed: true })])
    runner.queueInput([snapshot(A, { setPressed: true }, -1), snapshot(B, { setPressed: true }, 1)], 1)
    const { ticks } = runner.advanceFrame(5 * STEP)
    const contact = ticks.find(({ actionStep }) => actionStep.executedAction)!
    expect(contact.contactPoses.map(({ playerId }) => playerId)).toEqual([B.playerId, A.playerId])
    expect(contact.events.map(({ type }) => type)).toEqual([
      'PLAYER_CONTACT', 'PLAYER_CONTACT', 'PLAYER_CONTACT_RESPONSE',
    ])
    expect(contact.actionStep.executedAction?.action).toMatchObject({
      playerId: B.playerId, actionType: 'GENERIC_HIT', pressStep: 0,
    })
  })

  it('clears queued and captured input on blur and dispose and accepts a fresh key edge', () => {
    const keyboard = new EventTarget()
    const manager = new LocalInputManager([{ playerId: A.playerId, teamSide: 'A', deviceKind: 'keyboard' }], {
      keyboardTarget: keyboard as Window,
    })
    const runner = new SceneFixedStepRunner([A], () => ballAt(10))
    const press = (code: string, repeat = false) => keyboard.dispatchEvent(Object.assign(
      new Event('keydown', { cancelable: true }), { code, repeat },
    ))
    manager.start()
    const onBlur = () => runner.clearInput()
    keyboard.addEventListener('blur', onBlur)
    try {
      press('KeyE')
      runner.queueInput(manager.update())
      expect(runner.advanceFrame(STEP).ticks[0].actionStep.selectedActions).toHaveLength(1)
      press('KeyQ')
      press('Space')
      press('KeyW')
      runner.queueInput(manager.update())
      keyboard.dispatchEvent(new Event('blur'))
      press('KeyE', true)
      press('Space', true)
      runner.queueInput(manager.update())
      const { ticks: [afterBlur] } = runner.advanceFrame(STEP)
      expect(afterBlur.actionStep.selectedActions).toEqual([])
      expect(afterBlur.contactPoses[0]).toMatchObject({ position: A.position, grounded: true })

      press('KeyR')
      runner.queueInput(manager.update())
      expect(runner.advanceFrame(STEP).ticks[0].actionStep.selectedActions)
        .toMatchObject([{ actionType: 'SET', pressStep: 2 }])
      press('Space')
      runner.queueInput(manager.update())
    } finally {
      keyboard.removeEventListener('blur', onBlur)
      runner.clearInput()
      manager.dispose()
    }

    press('KeyE')
    runner.queueInput(manager.update())
    const { ticks: [afterDispose] } = runner.advanceFrame(STEP)
    expect(afterDispose.actionStep.selectedActions).toEqual([])
    expect(afterDispose.contactPoses[0].grounded).toBe(true)
  })

  it('invalidates only the disconnected gamepad player and rejects stale tick input', () => {
    const runner = new SceneFixedStepRunner([A, B], () => ballAt(10))
    runner.queueInput([snapshot(A, { hitPressed: true }), snapshot(B, { setPressed: true }, 1)])
    const { ticks: [before] } = runner.advanceFrame(STEP)
    expect(before.actionStep.selectedActions).toHaveLength(2)
    runner.queueInput([snapshot(B, { jumpPressed: true, forearmPassPressed: true }, 1)])
    runner.queueInput([snapshot(B, { deviceConnected: false })])
    const { ticks: [disconnected] } = runner.advanceFrame(STEP)
    expect(disconnected.actionStep.selectedActions).toMatchObject([{ playerId: A.playerId }])
    expect(disconnected.contactPoses[1]).toEqual(before.contactPoses[1])

    runner.queueInput([snapshot(B, { setPressed: true })])
    expect(runner.advanceFrame(STEP).ticks[0].actionStep.selectedActions).toMatchObject([
      { playerId: A.playerId }, { playerId: B.playerId, actionType: 'SET', pressStep: 2 },
    ])
    runner.queueInput([snapshot(B, { forearmPassPressed: true })])
    runner.clearInput([B.playerId])
    expect(runner.advanceFrame(STEP).ticks[0].actionStep.selectedActions).toMatchObject([
      { playerId: A.playerId },
    ])
    expect(() => runner.queueInput([], 0)).toThrow(RangeError)
  })
})

describe('SceneFixedStepRunner rally transitions', () => {
  it('prioritizes ground and resets inside the same frame without replaying held input', () => {
    let spawns = 0
    const runner = new SceneFixedStepRunner([contactPlayer], () => {
      if (spawns++ > 0) return ballAt()
      return {
        position: { x: 0, y: VOLLEYBALL_CONFIG.radius + 0.001, z: -1 },
        velocity: { x: 0, y: -1, z: 0 },
      }
    })
    runner.queueInput([snapshot(A, { setPressed: true, setHeld: true }, 1)])
    runner.queueInput([snapshot(A, { setHeld: true }, 1)], 1)
    runner.queueInput([snapshot(A, { forearmPassPressed: true, setHeld: true })], 2)
    const { ticks: [impact, reset] } = runner.advanceFrame(2.5 * STEP)
    expect(impact.events.map(({ type }) => type)).toEqual(['PLAYER_CONTACT', 'GROUND_CONTACT'])
    expect(impact.actionStep.executedAction).toBeNull()
    expect(reset).toMatchObject({
      sceneTick: 1, rallyStep: 0, rallyReset: true,
      actionStep: { selectedActions: [], executedAction: null },
    })
    expect(reset.events.map(({ type }) => type)).toEqual(['PLAYER_CONTACT'])
    expect(reset.contactPoses[0].position.x).toBeCloseTo(0.15, 12)
    expect(runner.sceneTick).toBe(2)
    expect(runner.rallyStep).toBe(1)
    expect(runner.accumulatorSeconds).toBeCloseTo(STEP / 2, 12)
    const { ticks: [next] } = runner.advanceFrame(STEP / 2)
    expect(next.actionStep.executedAction?.action).toMatchObject({
      actionType: 'FOREARM_PASS', pressStep: 1,
    })
    expect(next.events[0]).toMatchObject({ type: 'PLAYER_FOREARM_PASS_RESPONSE', contactStep: 0 })
  })

  it('replays a complete moving scene exactly at 30, 60 and 120 FPS', () => {
    const runs = rates.map((fps) => {
      const runner = new SceneFixedStepRunner([A, B])
      runner.queueInput([snapshot(B, {}, 1)], 4)
      runner.queueInput([snapshot(B, {}, -1)], 8)
      runner.queueInput([snapshot(B)], 12)
      runner.queueInput([snapshot(B, { jumpPressed: true, jumpHeld: true })], 48)
      runner.queueInput([snapshot(B, {}, 1)], 50)
      runner.queueInput([snapshot(B, {}, -1)], 52)
      runner.queueInput([snapshot(B)], 54)
      runner.queueInput([snapshot(B, { setPressed: true, setHeld: true })], 69)
      runner.queueInput([snapshot(B, { setHeld: true })], 70)
      runner.queueInput([snapshot(A, {}, 1)], 150)
      runner.queueInput([snapshot(A, { hitPressed: true }, -1)], 200)
      const ticks = trace(runner, fps, 4)
      expect(runner.sceneTick).toBe(240)
      expect(runner.accumulatorSeconds).toBe(0)
      return ticks
    })
    expect(runs[0]).toEqual(runs[1])
    expect(runs[2]).toEqual(runs[1])
    const ticks = runs[1]
    expect(ticks.map(({ sceneTick }) => sceneTick)).toEqual(Array.from({ length: 240 }, (_, i) => i))
    expect(ticks[0].contactPoses[1].grounded).toBe(true)
    expect(ticks[4].contactPoses[1].position.x).toBeLessThan(0)
    expect(ticks[50].contactPoses[1]).toMatchObject({ grounded: false })
    expect(ticks[50].contactPoses[1].position.x).not.toBe(ticks[49].contactPoses[1].position.x)
    const contact = ticks.find(({ actionStep }) => actionStep.executedAction)!
    expect(contact.sceneTick).toBe(71)
    expect(contact.events.map(({ type }) => type)).toEqual(['PLAYER_CONTACT', 'PLAYER_SET_RESPONSE'])
    expect(contact.events[1]).toMatchObject({
      playerId: B.playerId, pressStep: 69, contactStep: 71, outgoingVelocity: contact.ballState.velocity,
    })
    expect(isBallOverlappingPlayer(contact.ballState.position, contact.contactPoses[1])).toBe(true)
    const impact = ticks.findIndex(({ events }) => events.some(({ type }) => type === 'GROUND_CONTACT'))
    expect(impact).toBeGreaterThan(contact.sceneTick + 1)
    expect(ticks.slice(contact.sceneTick + 1, impact).some(
      ({ ballState, contactPoses }) => !isBallOverlappingPlayer(ballState.position, contactPoses[1]),
    )).toBe(true)
    expect(ticks[impact + 1]).toMatchObject({
      rallyReset: true, rallyStep: 0, actionStep: { selectedActions: [] },
    })
    expect(ticks[impact + 1].contactPoses[0].position.x)
      .toBeGreaterThan(ticks[impact].contactPoses[0].position.x)
    expect(ticks[200].actionStep.selectedActions).toMatchObject([
      { playerId: A.playerId, actionType: 'GENERIC_HIT', pressStep: ticks[200].rallyStep },
    ])
    expect(ticks[200].rallyStep).toBeLessThan(200)
  })
})
