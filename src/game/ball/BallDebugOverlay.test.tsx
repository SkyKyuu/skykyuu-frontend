import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BallDebugOverlay } from '@/game/ball/BallDebugOverlay'
import { FixedStepVolleyballSimulator } from '@/game/ball/FixedStepVolleyballSimulator'
import { VOLLEYBALL_SIMULATION_CONFIG } from '@/game/ball/volleyballSimulationConfig'

it('renders the applied set event and clears the section when its session ends', () => {
  const sim = new FixedStepVolleyballSimulator({
    position: { x: 0, y: 1, z: 0 }, velocity: { x: 0.4, y: 0, z: 0 },
  })
  const { events } = sim.advanceWithActions(
    VOLLEYBALL_SIMULATION_CONFIG.fixedStepSeconds,
    [{ playerId: 'setter', teamSide: 'B', position: { x: 0, y: 0, z: 0 } }],
    [{ actionType: 'SET', playerId: 'setter', setHeld: true, setPressed: true, aimLateral: 0.5, aimForward: -1 }],
  )
  const lastSetResponse = events.find((event) => event.type === 'PLAYER_SET_RESPONSE')
  expect(lastSetResponse).toBeDefined()
  const snapshot = {
    ...sim.getState(), accumulatorSeconds: sim.accumulatorSeconds, totalSimulationSteps: sim.totalSimulationSteps,
    lastLanding: null, lastPlayerContact: null, lastContactResponse: null, lastSetResponse,
  }
  const view = render(<BallDebugOverlay snapshot={snapshot} />)
  expect(screen.getByText('Last Set Response')).toBeInTheDocument()
  expect(screen.getByText('Player ID').nextElementSibling).toHaveTextContent('setter')
  expect(screen.getByText('Team').nextElementSibling).toHaveTextContent('B')
  expect(screen.getByText('Contact Entry Step').nextElementSibling).toHaveTextContent('0')
  expect(screen.getByText('Timing Grade').nextElementSibling).toHaveTextContent('PERFECT')
  expect(screen.getByText('Aim Lateral').nextElementSibling).toHaveTextContent('+0.500')
  expect(screen.getByText('Aim Forward').nextElementSibling).toHaveTextContent('-1.000')
  expect(screen.getByText('Outgoing Velocity X').nextElementSibling).toHaveTextContent('-0.700')
  expect(screen.getByText('Outgoing Velocity Y').nextElementSibling).toHaveTextContent('7.000')
  expect(screen.getByText('Outgoing Velocity Z').nextElementSibling).toHaveTextContent('0.400')
  view.rerender(<BallDebugOverlay snapshot={{ ...snapshot, lastSetResponse: null }} />)
  expect(screen.queryByText('Last Set Response')).not.toBeInTheDocument()
})

describe('BallDebugOverlay forward telemetry', () => {
  it.each([
    [Math.SQRT1_2, '+0.707', '+1.414', '6.414'],
    [-1, '-1.000', '-2.000', '3.000'],
    [0, '0.000', '0.000', '5.000'],
  ] as const)('displays local forward %s with its sign', (aimForward, expected, contribution, outgoing) => {
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
    expect(screen.getByText('Aim Vz Contribution').nextElementSibling).toHaveTextContent(contribution)
    expect(screen.getByText('Outgoing Vz').nextElementSibling).toHaveTextContent(outgoing)
    expect(screen.queryByText(/Hit Aim World Z/)).not.toBeInTheDocument()
  })

  it.each([
    ['A', 1, '+1.000', '+0.850', '+0.850', '+1.700', '6.200'],
    ['B', 1, '+1.000', '+0.850', '-0.850', '-1.700', '-6.200'],
    ['B', -1, '-1.000', '-0.850', '+0.850', '+1.700', '-2.800'],
    ['A', Math.SQRT1_2, '+0.707', '+0.601', '+0.601', '+1.202', '5.702'],
  ] as const)('displays EARLY Team %s forward %s fidelity', (teamSide, aimForward, raw, effective, worldZ, contribution, outgoing) => {
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
    expect(screen.getByText('Aim Vz Contribution').nextElementSibling).toHaveTextContent(contribution)
    expect(screen.getByText('Outgoing Vz').nextElementSibling).toHaveTextContent(outgoing)
  })
})
