import { describe, expect, it } from 'vitest'
import { VOLLEYBALL_SIMULATION_CONFIG } from '@/game/ball/volleyballSimulationConfig'
import type { VolleyballState } from '@/game/ball/volleyballState'
import type { LocalPlayerInputSnapshot } from '@/game/input/inputTypes'
import { SceneFixedStepRunner } from '@/game/scene/SceneFixedStepRunner'

const { fixedStepSeconds: STEP, gravity } = VOLLEYBALL_SIMULATION_CONFIG
const player = { playerId: 'a', teamSide: 'A', position: { x: 0, y: 0, z: -1 } } as const

function sample(overrides: Partial<LocalPlayerInputSnapshot>): LocalPlayerInputSnapshot {
  return {
    playerId: player.playerId, teamSide: player.teamSide,
    deviceKind: 'keyboard', deviceConnected: true, deviceName: 'Keyboard',
    localMove: { lateral: 0, forward: 0 }, worldMove: { worldX: 0, worldZ: 0 },
    jumpHeld: false, jumpPressed: false, hitHeld: false, hitPressed: false,
    forearmPassHeld: false, forearmPassPressed: false, setHeld: false, setPressed: false,
    spikeHeld: false, spikePressed: false,
    ...overrides,
  }
}

function ball(y: number, vy = 0): VolleyballState {
  return { position: { x: 0, y, z: -1 }, velocity: { x: 0, y: vy, z: 0 } }
}

function replay(fps: number, runner: SceneFixedStepRunner, seconds: number) {
  return Array.from({ length: seconds * fps }, () => runner.advanceFrame(1 / fps).ticks).flat()
}

describe('SPIKE uses the immutable pose for the actual response tick', () => {
  it('accepts a buffered ground press if a later jump starts in the contact tick', () => {
    // Outside the horizontal capsule in tick zero. Movement and jump create the overlap at tick one.
    const start = () => ({ position: { x: 0.44, y: 1, z: -1 }, velocity: { x: 0, y: 0, z: 0 } })
    const runner = new SceneFixedStepRunner([player], start)
    runner.queueInput([sample({ spikePressed: true })], 0)
    runner.queueInput([sample({ jumpPressed: true, worldMove: { worldX: 1, worldZ: 0 } })], 1)
    const [pressed, response] = runner.advanceFrame(2 * STEP).ticks
    expect(pressed.contactPoses[0].grounded).toBe(true)
    expect(pressed.events).toEqual([])
    expect(response.contactPoses[0].grounded).toBe(false)
    expect(response.contactPoses[0].verticalVelocity).toBeGreaterThan(0)
    expect(response.events[1]).toMatchObject({
      type: 'PLAYER_SPIKE_RESPONSE', pressStep: 0, contactStep: 1, responseStep: 1,
      timingOffsetSteps: -1, timingGrade: 'EARLY',
    })
  })

  it('accepts the falling pose one tick before landing and rejects the actual landing tick', () => {
    function responseAt(tick: number) {
      const runner = new SceneFixedStepRunner([player], () => ball(4))
      runner.queueInput([sample({ jumpPressed: true })], 0)
      runner.queueInput([sample({ spikePressed: true })], tick)
      return replay(60, runner, 1)[tick]
    }
    const descending = responseAt(48)
    expect(descending.contactPoses[0].grounded).toBe(false)
    expect(descending.contactPoses[0].verticalVelocity).toBeLessThan(0)
    expect(descending.events).toMatchObject([{ type: 'PLAYER_SPIKE_RESPONSE', responseStep: 48 }])

    const landing = responseAt(49)
    expect(landing.contactPoses[0]).toMatchObject({ grounded: true, verticalVelocity: 0 })
    expect(landing.events).toEqual([])
    expect(landing.actionStep.rejectedActions).toEqual([
      { playerId: 'a', actionType: 'SPIKE', pressStep: 49, responseStep: 49, reason: 'GROUNDED' },
    ])
  })

  it('replays real jump, Model C near the apex, reset, GROUNDED and fallback exactly at 30/60/120 FPS', () => {
    const run = (fps: number) => {
      let rally = 0
      const runner = new SceneFixedStepRunner([player], () =>
        rally++ === 0 ? ball(2.7, gravity * (25 * STEP) / 2) : ball(1),
      )
      runner.queueInput([sample({ jumpPressed: true })], 0)
      runner.queueInput([sample({ spikePressed: true, spikeHeld: true })], 24)
      runner.queueInput([sample({ spikeHeld: true })], 25)
      runner.queueInput([sample({ spikePressed: true, spikeHeld: true })], 75)
      runner.queueInput([sample({ spikeHeld: false })], 76)
      runner.queueInput([sample({ jumpPressed: true, spikePressed: true, spikeHeld: true })], 77)
      runner.queueInput([sample({ spikeHeld: true })], 78)
      const ticks = replay(fps, runner, 2)
      expect(runner.sceneTick).toBe(120)
      expect(runner.accumulatorSeconds).toBe(0)
      return ticks
    }

    const ticks = run(60)
    expect(run(30)).toEqual(ticks)
    expect(run(120)).toEqual(ticks)
    const apex = ticks[24]
    expect(apex.contactPoses[0].position.y).toBeCloseTo(0.85, 3)
    expect(Object.isFrozen(apex.contactPoses[0])).toBe(true)
    expect(apex.events).toMatchObject([{ type: 'PLAYER_SPIKE_RESPONSE', trajectoryMode: 'MODEL_C' }])
    expect(ticks[75].actionStep.rejectedActions).toMatchObject([{ reason: 'GROUNDED' }])
    expect(ticks[77].events).toMatchObject([{ type: 'PLAYER_SPIKE_RESPONSE', trajectoryMode: 'BASELINE_B_FALLBACK' }])
    expect(ticks[77].contactPoses[0].grounded).toBe(false)
    const resets = ticks.filter(({ rallyReset }) => rallyReset)
    expect(resets.length).toBeGreaterThanOrEqual(2)
    for (const reset of resets) {
      expect(ticks[reset.sceneTick - 1].events.at(-1)?.type).toBe('GROUND_CONTACT')
      expect(reset.rallyStep).toBe(0)
      expect(reset.actionStep.selectedActions).toEqual([])
    }
  })
})
