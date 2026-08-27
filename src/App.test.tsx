import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from '@/App'

vi.mock('@/game/GameCanvas', () => ({
  default: () => <canvas role="img" aria-label="SkyKyuu 3D scene" />,
}))

describe('App', () => {
  it('renders the game canvas', () => {
    render(<App />)

    expect(screen.getByRole('img', { name: 'SkyKyuu 3D scene' })).toBeInTheDocument()
  })
})
