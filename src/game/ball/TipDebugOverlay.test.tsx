import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BallDebugOverlay, type BallDebugSnapshot } from '@/game/ball/BallDebugOverlay'
import { FixedStepVolleyballSimulator } from '@/game/ball/FixedStepVolleyballSimulator'
import { InputDebugOverlay, type PlayerDebugSnapshot } from '@/game/input/InputDebugOverlay'

describe('TIP diagnostics preserve the existing overlay contracts', () => {
  it('shows independent TIP and SPIKE button flags and the authoritative selected action', () => {
    const snapshot: PlayerDebugSnapshot = {
      playerId: 'a', teamSide: 'A', deviceKind: 'keyboard', deviceName: 'Keyboard', deviceConnected: true,
      localMove: { lateral: 0, forward: 0 }, worldMove: { worldX: 0, worldZ: 0 },
      jumpHeld: false, jumpPressed: false, hitHeld: false, hitPressed: false,
      forearmPassHeld: false, forearmPassPressed: false, setHeld: false, setPressed: false,
      spikeHeld: true, spikePressed: false, tipHeld: false, tipPressed: true,
      simulationStep: 2, position: { x: 0, y: 0.8, z: -0.5 }, grounded: false, verticalVelocity: 0,
      selectedAction: { playerId: 'a', actionType: 'TIP', pressStep: 1, aimLateral: 0, aimForward: 0 },
      lastExecutedAction: null,
    }
    render(<InputDebugOverlay snapshots={[snapshot]} />)
    expect(screen.getByText('Tip Held').nextElementSibling).toHaveTextContent('false')
    expect(screen.getByText('Tip Pressed').nextElementSibling).toHaveTextContent('true')
    expect(screen.getByText('Spike Held').nextElementSibling).toHaveTextContent('true')
    expect(screen.getByText('Spike Pressed').nextElementSibling).toHaveTextContent('false')
    expect(screen.getByText('Selected Action').nextElementSibling).toHaveTextContent('TIP')
  })

  it('renders the applied TIP plan and keeps TIP rejection separate from SPIKE rejection', () => {
    const sim = new FixedStepVolleyballSimulator({
      position: { x: 0, y: 2.65, z: -0.5 }, velocity: { x: 0, y: 0, z: 0 },
    })
    const result = sim.advanceWithActions(1 / 60,
      [{ playerId: 'a', teamSide: 'A', grounded: false, position: { x: 0, y: 1, z: -0.5 } }],
      [{ playerId: 'a', teamSide: 'A', actionType: 'TIP', tipPressed: true, aimLateral: 0, aimForward: 0 }],
    )
    const event = result.events.find(x => x.type === 'PLAYER_TIP_RESPONSE')
    if (!event) throw new Error('TIP fixture must execute')
    const snapshot: BallDebugSnapshot = {
      ...sim.getState(), accumulatorSeconds: sim.accumulatorSeconds, totalSimulationSteps: sim.totalSimulationSteps,
      lastLanding: null, lastPlayerContact: null, lastContactResponse: null, lastTipResponse: event,
      lastSpikeRejection: { playerId: 'spiker', actionType: 'SPIKE', pressStep: 0, responseStep: 0, reason: 'GROUNDED' },
      lastTipRejection: { playerId: 'tipper', actionType: 'TIP', pressStep: 1, responseStep: 1, reason: 'INVALID_TARGET' },
    }
    const view = render(<BallDebugOverlay snapshot={snapshot} />)
    const tip = screen.getByText('Last Tip Response').closest('dl')!
    expect(within(tip).getByText('Flight Time').nextElementSibling).toHaveTextContent('0.950')
    expect(within(tip).getByText('Target X / Y / Z').nextElementSibling).toHaveTextContent('0.000 / 0.105 / 1.900')
    expect(within(tip).getByText('Timing').nextElementSibling).toHaveTextContent('PERFECT')
    expect(within(screen.getByText('Last Tip Rejection').closest('dl')!).getByText('INVALID_TARGET')).toBeInTheDocument()
    expect(within(screen.getByText('Last Spike Rejection').closest('dl')!).getByText('GROUNDED')).toBeInTheDocument()
    view.rerender(<BallDebugOverlay snapshot={{ ...snapshot, lastTipResponse: null, lastTipRejection: null }} />)
    expect(screen.queryByText('Last Tip Response')).not.toBeInTheDocument()
    expect(screen.queryByText('Last Tip Rejection')).not.toBeInTheDocument()
    expect(screen.getByText('Last Spike Rejection')).toBeInTheDocument()
  })
})
