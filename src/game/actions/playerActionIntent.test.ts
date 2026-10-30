import { describe, expect, it } from 'vitest'
import { createPlayerActionIntent } from '@/game/actions/playerActionIntent'
import { createPlayerHitIntent, type PlayerHitIntent } from '@/game/contact/playerHitIntent'
import type { LocalPlayerInputSnapshot } from '@/game/input/inputTypes'
import { FixedStepVolleyballSimulator } from '@/game/ball/FixedStepVolleyballSimulator'
import { VOLLEYBALL_SIMULATION_CONFIG } from '@/game/ball/volleyballSimulationConfig'

function hitIntent(overrides: Partial<PlayerHitIntent> = {}): PlayerHitIntent {
  return {
    playerId: 'player-local', hitHeld: true, hitPressed: true,
    aimLateral: 0.375, aimForward: -0.25, ...overrides,
  }
}

function snapshot(teamSide: 'A' | 'B'): LocalPlayerInputSnapshot {
  return {
    playerId: 'player-local', teamSide, deviceKind: 'keyboard',
    deviceName: 'Keyboard', deviceConnected: true,
    localMove: { lateral: Math.SQRT1_2, forward: -Math.SQRT1_2 },
    worldMove: { worldX: teamSide === 'A' ? 1 : -1, worldZ: teamSide === 'A' ? -1 : 1 },
    jumpHeld: false, jumpPressed: false, hitHeld: true, hitPressed: true,
  }
}

describe('createPlayerActionIntent', () => {
  it('represents exactly the captured hit fields and GENERIC_HIT', () => {
    const intent = hitIntent()
    expect(createPlayerActionIntent(intent)).toEqual({
      actionType: 'GENERIC_HIT', playerId: 'player-local',
      hitHeld: true, hitPressed: true, aimLateral: 0.375, aimForward: -0.25,
    })
    expect(intent).not.toHaveProperty('actionType')
  })

  it.each(['player-a', 'player-b', ' jogador/α 01 '])('preserves playerId %s exactly', (playerId) => {
    expect(createPlayerActionIntent(hitIntent({ playerId })).playerId).toBe(playerId)
  })

  it.each([
    [false, false], [true, false], [true, true], [false, true],
  ])('preserves held %s and pressed %s without deciding validity', (hitHeld, hitPressed) => {
    expect(createPlayerActionIntent(hitIntent({ hitHeld, hitPressed }))).toMatchObject({ hitHeld, hitPressed })
  })

  it.each([
    [-1, 1], [0, 0], [1, -1], [-0, -0],
    [0.375, -0.25], [-Math.SQRT1_2, Math.SQRT1_2], [Math.SQRT1_2, -Math.SQRT1_2],
  ])('preserves local lateral %s and forward %s without normalization or world conversion', (aimLateral, aimForward) => {
    const action = createPlayerActionIntent(hitIntent({ aimLateral, aimForward }))
    expect(action.aimLateral).toBe(aimLateral)
    expect(action.aimForward).toBe(aimForward)
  })

  it('leaves numeric validation in the existing hit flow', () => {
    for (const value of [-1.01, 1.01, NaN, Infinity, -Infinity]) {
      const action = createPlayerActionIntent(hitIntent({ aimLateral: value, aimForward: value }))
      expect(action.aimLateral).toBe(value)
      expect(action.aimForward).toBe(value)
    }
  })

  it('preserves identical local representation for both teams despite opposite world inputs', () => {
    const teamA = snapshot('A')
    const teamB = snapshot('B')
    expect(teamA.worldMove).not.toEqual(teamB.worldMove)
    const actionA = createPlayerActionIntent(createPlayerHitIntent(teamA))
    const actionB = createPlayerActionIntent(createPlayerHitIntent(teamB))
    expect(actionA).toEqual(actionB)
    expect(actionA.aimLateral).toBe(Math.SQRT1_2)
    expect(actionA.aimForward).toBe(-Math.SQRT1_2)
    expect(actionA).not.toHaveProperty('teamSide')
    expect(actionA).not.toHaveProperty('worldMove')
  })

  it('does not mutate or freeze the input and returns an immutable independent value', () => {
    const intent = hitIntent()
    const original = { ...intent }
    const action = createPlayerActionIntent(intent)
    expect(intent).toEqual(original)
    expect(Object.isFrozen(intent)).toBe(false)
    expect(Object.isFrozen(action)).toBe(true)
    expect(Reflect.set(action, 'aimForward', 1)).toBe(false)
    expect(Reflect.set(action, 'actionType', 'OTHER')).toBe(false)
    intent.playerId = 'changed'
    intent.hitHeld = false
    intent.hitPressed = false
    intent.aimLateral = -1
    intent.aimForward = 1
    expect(action).toEqual({ actionType: 'GENERIC_HIT', ...original })
  })

  it('deterministically adapts frozen inputs without retaining prior intentions', () => {
    const first = Object.freeze(hitIntent())
    const second = Object.freeze(hitIntent({ playerId: 'second', aimForward: 1 }))
    const before = createPlayerActionIntent(first)
    expect(createPlayerActionIntent(second).playerId).toBe('second')
    expect(createPlayerActionIntent(first)).toEqual(before)
    expect(createPlayerActionIntent(first)).not.toBe(before)
  })

  it('preserves the legacy factory shape and simulator API without inserting an action into the hit flow', () => {
    function run(adapt: boolean) {
      const input = snapshot('A')
      const originalInput = structuredClone(input)
      const intent = createPlayerHitIntent(input)
      expect(intent).toEqual({
        playerId: 'player-local', hitHeld: true, hitPressed: true,
        aimLateral: Math.SQRT1_2, aimForward: -Math.SQRT1_2,
      })
      if (adapt) createPlayerActionIntent(intent)
      expect(input).toEqual(originalInput)
      expect(intent).not.toHaveProperty('actionType')
      const simulator = new FixedStepVolleyballSimulator({
        position: { x: 0, y: 1, z: 0 }, velocity: { x: 0.25, y: 0, z: 0 },
      })
      const result = simulator.advance(VOLLEYBALL_SIMULATION_CONFIG.fixedStepSeconds, [
        { playerId: input.playerId, teamSide: input.teamSide, position: { x: 0, y: 0, z: 0 } },
      ], [intent])
      const event = result.events.find((event) => event.type === 'PLAYER_CONTACT_RESPONSE')
      if (!event || event.type !== 'PLAYER_CONTACT_RESPONSE') throw new Error('Missing response')
      expect(event.outgoingVelocity).toEqual({ x: 0.25 + Math.SQRT1_2 * 3, y: 6.3, z: 5 - Math.SQRT1_2 * 2 })
      const responseState = simulator.getState()
      const following = simulator.advance(VOLLEYBALL_SIMULATION_CONFIG.fixedStepSeconds)
      return { result, responseState, following, followingState: simulator.getState() }
    }
    expect(run(true)).toEqual(run(false))
  })
})
