import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BallDebugOverlay } from '@/game/ball/BallDebugOverlay'
import { FixedStepVolleyballSimulator } from '@/game/ball/FixedStepVolleyballSimulator'
import { VOLLEYBALL_SIMULATION_CONFIG } from '@/game/ball/volleyballSimulationConfig'

describe('BallDebugOverlay forward telemetry', () => {
  it.each([
    [Math.SQRT1_2, '+0.707'],
    [-1, '-1.000'],
    [0, '0.000'],
  ] as const)('displays local forward %s with its sign', (aimForward, expected) => {
    const simulator = new FixedStepVolleyballSimulator({
      position: { x: 0, y: 1, z: 0 }, velocity: { x: 0, y: 0, z: 0 },
    })
    const result = simulator.advance(
      VOLLEYBALL_SIMULATION_CONFIG.fixedStepSeconds,
      [{ playerId: 'player', teamSide: 'A', position: { x: 0, y: 0, z: 0 } }],
      [{ playerId: 'player', hitHeld: true, hitPressed: true, aimLateral: 0, aimForward }],
    )
    const event = result.events.find((event) => event.type === 'PLAYER_CONTACT_RESPONSE')
    if (!event || event.type !== 'PLAYER_CONTACT_RESPONSE') throw new Error('Missing response')
    render(<BallDebugOverlay snapshot={{
      ...simulator.getState(), accumulatorSeconds: simulator.accumulatorSeconds,
      totalSimulationSteps: simulator.totalSimulationSteps,
      lastLanding: null, lastPlayerContact: null, lastContactResponse: event,
    }} />)
    expect(screen.getByText('Hit Aim Forward (local)').nextElementSibling).toHaveTextContent(expected)
    expect(screen.getByText('Effective Aim Forward').nextElementSibling).toHaveTextContent(expected)
    expect(screen.getByText('Effective Aim World Z').nextElementSibling).toHaveTextContent(expected)
    expect(screen.queryByText(/Hit Aim World Z/)).not.toBeInTheDocument()
  })

  it.each([
    ['A', 1, '+1.000', '+0.850', '+0.850'],
    ['B', 1, '+1.000', '+0.850', '-0.850'],
    ['B', -1, '-1.000', '-0.850', '+0.850'],
    ['A', Math.SQRT1_2, '+0.707', '+0.601', '+0.601'],
  ] as const)('displays EARLY Team %s forward %s fidelity', (teamSide, aimForward, raw, effective, worldZ) => {
    const simulator = new FixedStepVolleyballSimulator({
      position: { x: 0, y: 1, z: 0 }, velocity: { x: 0, y: 0, z: 0 },
    })
    const step = VOLLEYBALL_SIMULATION_CONFIG.fixedStepSeconds
    simulator.advance(step, [], [
      { playerId: 'player', hitHeld: true, hitPressed: true, aimLateral: 0, aimForward },
    ])
    const result = simulator.advance(step, [
      { playerId: 'player', teamSide, position: { x: 0, y: 0, z: 0 } },
    ])
    const event = result.events.find((event) => event.type === 'PLAYER_CONTACT_RESPONSE')
    if (!event || event.type !== 'PLAYER_CONTACT_RESPONSE') throw new Error('Missing response')
    render(<BallDebugOverlay snapshot={{
      ...simulator.getState(), accumulatorSeconds: simulator.accumulatorSeconds,
      totalSimulationSteps: simulator.totalSimulationSteps,
      lastLanding: null, lastPlayerContact: null, lastContactResponse: event,
    }} />)
    expect(screen.getByText('Hit Aim Forward (local)').nextElementSibling).toHaveTextContent(raw)
    expect(screen.getByText('Effective Aim Forward').nextElementSibling).toHaveTextContent(effective)
    expect(screen.getByText('Effective Aim World Z').nextElementSibling).toHaveTextContent(worldZ)
    expect(screen.queryByText(/Aim Vz Contribution/)).not.toBeInTheDocument()
  })
})
