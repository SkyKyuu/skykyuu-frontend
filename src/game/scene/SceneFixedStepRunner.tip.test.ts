import { describe, expect, it } from 'vitest'
import { VOLLEYBALL_SIMULATION_CONFIG } from '@/game/ball/volleyballSimulationConfig'
import type { VolleyballState } from '@/game/ball/volleyballState'
import type { LocalPlayerInputSnapshot } from '@/game/input/inputTypes'
import { SceneFixedStepRunner } from '@/game/scene/SceneFixedStepRunner'

const { fixedStepSeconds: STEP, gravity } = VOLLEYBALL_SIMULATION_CONFIG
const player = { playerId: 'a', teamSide: 'A', position: { x: 0, y: 0, z: -1 } } as const

function sample(overrides: Partial<LocalPlayerInputSnapshot> = {}): LocalPlayerInputSnapshot {
  return {
    playerId: 'a', teamSide: 'A', deviceKind: 'keyboard', deviceConnected: true, deviceName: 'Keyboard',
    localMove: { lateral: 0, forward: 0 }, worldMove: { worldX: 0, worldZ: 0 },
    jumpHeld: false, jumpPressed: false, hitHeld: false, hitPressed: false,
    forearmPassHeld: false, forearmPassPressed: false, setHeld: false, setPressed: false,
    spikeHeld: false, spikePressed: false, tipHeld: false, tipPressed: false,
    ...overrides,
  }
}

function ball(height: number, verticalVelocity = 0, side = 1): VolleyballState {
  return { position: { x: 0, y: height, z: -side }, velocity: { x: 0, y: verticalVelocity, z: 0 } }
}

function replay(fps: number, runner: SceneFixedStepRunner, seconds: number) {
  return Array.from({ length: seconds * fps }, () => runner.advanceFrame(1 / fps).ticks).flat()
}

describe('TIP uses the immutable scene response pose and tick queue', () => {
  it('executes a ground-buffered TIP when movement and jumping create overlap on the next tick', () => {
    const runner = new SceneFixedStepRunner([player], () => ({
      position: { x: 0.44, y: 1.5, z: -1 }, velocity: { x: 0, y: 0, z: 0 },
    }))
    runner.queueInput([sample({ tipPressed: true })], 0)
    runner.queueInput([sample({ jumpPressed: true, worldMove: { worldX: 1, worldZ: 0 } })], 1)
    const [captured, response] = runner.advanceFrame(2 * STEP).ticks
    expect(captured.contactPoses[0].grounded).toBe(true)
    expect(captured.events).toEqual([])
    expect(captured.actionStep.selectedActions).toMatchObject([{ actionType: 'TIP', pressStep: 0 }])
    expect(response.contactPoses[0].grounded).toBe(false)
    expect(response.contactPoses[0].verticalVelocity).toBeGreaterThan(0)
    const tip = response.events.find((event) => event.type === 'PLAYER_TIP_RESPONSE')!
    expect(tip).toMatchObject({ pressStep: 0, contactStep: 1, responseStep: 1, timingGrade: 'EARLY' })
    expect(tip.targetPosition.x).toBe(0.44)
    expect(tip.targetPosition.x).not.toBe(response.contactPoses[0].position.x)
    expect(Object.isFrozen(response.contactPoses)).toBe(true)
    expect(Object.isFrozen(response.contactPoses[0])).toBe(true)
    expect(Object.isFrozen(response.contactPoses[0].position)).toBe(true)
  })

  it('accepts jump and TIP on one response tick, but a rejected grounded TIP is not resurrected by a later jump', () => {
    const jumping = new SceneFixedStepRunner([player], () => ball(1.5))
    jumping.queueInput([sample({ tipPressed: true, jumpPressed: true })], 0)
    const accepted = jumping.advanceFrame(STEP).ticks[0]
    expect(accepted.contactPoses[0].grounded).toBe(false)
    expect(accepted.events.map(({ type }) => type)).toEqual(['PLAYER_CONTACT', 'PLAYER_TIP_RESPONSE'])

    const grounded = new SceneFixedStepRunner([player], () => ball(1.5))
    grounded.queueInput([sample({ tipPressed: true })], 0)
    grounded.queueInput([sample({ jumpPressed: true })], 1)
    const [rejected, laterJump] = grounded.advanceFrame(2 * STEP).ticks
    expect(rejected.actionStep.rejectedActions).toEqual([
      { playerId: 'a', actionType: 'TIP', pressStep: 0, responseStep: 0, reason: 'GROUNDED' },
    ])
    expect(laterJump.contactPoses[0].grounded).toBe(false)
    expect(laterJump.events).toEqual([])
    expect(laterJump.actionStep.selectedActions).toEqual([])
  })

  it('accepts a descending airborne contact and rejects the actual player landing tick', () => {
    const responseAt = (tick: number) => {
      const runner = new SceneFixedStepRunner([player], () => ball(4.9))
      runner.queueInput([sample({ jumpPressed: true })], 0)
      runner.queueInput([sample({ tipPressed: true })], tick)
      return replay(60, runner, 1)[tick]
    }
    const falling = responseAt(48)
    expect(falling.contactPoses[0].grounded).toBe(false)
    expect(falling.contactPoses[0].verticalVelocity).toBeLessThan(0)
    expect(falling.events).toMatchObject([{ type: 'PLAYER_TIP_RESPONSE', responseStep: 48 }])
    const landing = responseAt(49)
    expect(landing.contactPoses[0]).toMatchObject({ grounded: true, verticalVelocity: 0 })
    expect(landing.events).toEqual([])
    expect(landing.actionStep.rejectedActions).toEqual([
      { playerId: 'a', actionType: 'TIP', pressStep: 49, responseStep: 49, reason: 'GROUNDED' },
    ])
  })

  it('keeps a captured edge through a zero-tick frame and consumes it once in a multi-tick frame', () => {
    const runner = new SceneFixedStepRunner([player], () => ({
      position: { x: 0.44, y: 1.5, z: -1 }, velocity: { x: 0, y: 0, z: 0 },
    }))
    const sourceAim = { lateral: 0.25, forward: -0.5 }
    runner.queueInput([sample({ tipPressed: true, tipPressAim: sourceAim })])
    expect(runner.advanceFrame(STEP / 2).ticks).toEqual([])
    sourceAim.lateral = -1
    sourceAim.forward = 1
    runner.queueInput([sample({ jumpPressed: true, tipHeld: true, worldMove: { worldX: 1, worldZ: 0 } })])
    const frame = runner.advanceFrame(3 * STEP / 2)
    expect(frame.ticks).toHaveLength(2)
    const responses = frame.ticks.flatMap(({ events }) => events).filter((event) => event.type === 'PLAYER_TIP_RESPONSE')
    expect(responses).toHaveLength(1)
    expect(responses[0]).toMatchObject({ aimLateral: 0.25, aimForward: -0.5, pressStep: 0, responseStep: 0 })
    expect(frame.ticks[1].actionStep.executedAction).toBeNull()
  })

  it('clearInput removes queued and pending TIP edges without clearing another player', () => {
    const other = { playerId: 'b', teamSide: 'B', position: { x: 0, y: 0, z: 4.5 } } as const
    const runner = new SceneFixedStepRunner([player, other], () => ({
      position: { x: 0.44, y: 1.5, z: -1 }, velocity: { x: 0, y: 0, z: 0 },
    }))
    runner.queueInput([sample({ tipPressed: true }), sample({ playerId: 'b', teamSide: 'B', tipPressed: true })])
    runner.advanceFrame(STEP)
    runner.queueInput([sample({ tipPressed: true })])
    runner.clearInput(['a'])
    runner.queueInput([sample({ jumpPressed: true, worldMove: { worldX: 1, worldZ: 0 } })])
    const response = runner.advanceFrame(STEP).ticks[0]
    expect(response.events.map(({ type }) => type)).toEqual(['PLAYER_CONTACT'])
    expect(response.actionStep.selectedActions).toMatchObject([{ playerId: 'b', actionType: 'TIP', pressStep: 0 }])
    expect(response.actionStep.executedAction).toBeNull()
  })

  it.each(['A', 'B'] as const)('replays Team %s real jumps, TIP, simultaneous actions, rejection chains, landing and reset at30/60/120FPS', (team) => {
    const sign = team === 'A' ? 1 : -1
    const run = (fps: number, withSpike = false) => {
      let rally = 0
      const primary = { playerId: 'a', teamSide: team, position: { x: 0, y: 0, z: -sign } }
      const other = { playerId: 'b', teamSide: team === 'A' ? 'B' as const : 'A' as const, position: { x: 0, y: 0, z: sign * 4.5 } }
      const runner = new SceneFixedStepRunner([primary, other], () =>
        rally++ === 0 ? ball(2.7, gravity * (25 * STEP) / 2, sign) : ball(1, 0, sign),
      )
      const input = (overrides: Partial<LocalPlayerInputSnapshot>) => sample({ teamSide: team, ...overrides })
      runner.queueInput([input({ jumpPressed: true })], 0)
      runner.queueInput([
        input({ tipPressed: true, tipHeld: true, tipPressAim: { lateral: 0.25, forward: -0.5 }, setPressed: true, forearmPassPressed: true, hitPressed: true, spikePressed: withSpike }),
        input({ playerId: 'b', teamSide: other.teamSide, deviceKind: 'gamepad', tipPressed: true }),
      ], 24)
      runner.queueInput([input({ tipHeld: true })], 25)
      runner.queueInput([input({ tipPressed: true, spikePressed: true, setPressed: true })], 100)
      const ticks = replay(fps, runner, 3)
      expect(runner.sceneTick).toBe(180)
      expect(runner.accumulatorSeconds).toBe(0)
      return ticks
    }
    const ticks = run(60)
    expect(run(30)).toEqual(ticks)
    expect(run(120)).toEqual(ticks)
    expect(ticks[24].contactPoses[0].grounded).toBe(false)
    expect(ticks[24].actionStep.executedAction?.action.actionType).toBe('TIP')
    expect(ticks[24].actionStep.selectedActions).toMatchObject([
      { playerId: 'a', actionType: 'TIP' }, { playerId: 'b', actionType: 'TIP' },
    ])
    const event = ticks[24].events.find((event) => event.type === 'PLAYER_TIP_RESPONSE')!
    expect(event.targetPosition).toEqual({ x: sign * 0.5, y: 0.105, z: sign * (1.9 - 1.1 / 2) })
    const landing = ticks.slice(25).flatMap(({ events }) => events).find((event) => event.type === 'GROUND_CONTACT')!
    expect(Math.hypot(landing.position.x - event.targetPosition.x, landing.position.y - event.targetPosition.y, landing.position.z - event.targetPosition.z)).toBeLessThanOrEqual(1e-9)
    expect(ticks[100].actionStep.rejectedActions).toMatchObject([
      { actionType: 'SPIKE', reason: 'GROUNDED' }, { actionType: 'TIP', reason: 'GROUNDED' },
    ])
    expect(ticks[100].actionStep.executedAction?.action.actionType).toBe('SET')
    const resets = ticks.filter(({ rallyReset }) => rallyReset)
    expect(resets.length).toBeGreaterThan(0)
    for (const reset of resets) {
      expect(ticks[reset.sceneTick - 1].events.at(-1)?.type).toBe('GROUND_CONTACT')
      expect(reset.rallyStep).toBe(0)
      expect(reset.actionStep.selectedActions).toEqual([])
    }
    const spike = run(60, true)
    expect(run(30, true)).toEqual(spike)
    expect(run(120, true)).toEqual(spike)
    expect(spike[24].actionStep.executedAction?.action.actionType).toBe('SPIKE')
    expect(spike[24].events.some(({ type }) => type === 'PLAYER_TIP_RESPONSE')).toBe(false)
  })

  it('mirrors successful TIP scene physics while preserving y, vy, flight time and local aim', () => {
    const responses = (['A', 'B'] as const).map((team) => {
      const sign = team === 'A' ? 1 : -1
      const runner = new SceneFixedStepRunner([{ playerId: 'a', teamSide: team, position: { x: 0, y: 0, z: -sign } }], () => ball(1.5, 0, sign))
      runner.queueInput([sample({ teamSide: team, jumpPressed: true, tipPressed: true, tipPressAim: { lateral: 0.5, forward: -0.5 } })], 0)
      return runner.advanceFrame(STEP).ticks[0].events.find((event) => event.type === 'PLAYER_TIP_RESPONSE')!
    })
    const [a, b] = responses
    expect(a).toBeDefined()
    expect(b).toBeDefined()
    for (const field of ['ballPosition', 'outgoingVelocity', 'targetPosition'] as const) {
      expect(b[field].x).toBeCloseTo(-a[field].x, 12)
      expect(b[field].z).toBeCloseTo(-a[field].z, 12)
      expect(b[field].y).toBe(a[field].y)
    }
    expect(b.flightTimeSeconds).toBe(a.flightTimeSeconds)
    expect(b.aimLateral).toBe(a.aimLateral)
    expect(b.aimForward).toBe(a.aimForward)
  })
})
