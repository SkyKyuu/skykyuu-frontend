import { describe, expect, it } from 'vitest'
import { PlayerActionResolver, type PlayerCommandIntent } from '@/game/actions/playerActionResolver'
import type { TipIntent } from '@/game/actions/tipIntent'

const tip: TipIntent = {
  actionType: 'TIP', playerId: 'a', teamSide: 'A', tipPressed: true,
  aimLateral: 0.25, aimForward: -0.5,
}
const others: PlayerCommandIntent[] = [
  { actionType: 'SPIKE', playerId: 'a', teamSide: 'A', spikePressed: true, aimLateral: 0, aimForward: 0 },
  { actionType: 'SET', playerId: 'a', setHeld: true, setPressed: true, aimLateral: 0, aimForward: 0 },
  { actionType: 'FOREARM_PASS', playerId: 'a', forearmPassHeld: true, forearmPassPressed: true, aimLateral: 0, aimForward: 0 },
  { actionType: 'GENERIC_HIT', playerId: 'a', hitHeld: true, hitPressed: true, aimLateral: 0, aimForward: 0 },
]

describe('TIP shares the existing capture clock and arbitration', () => {
  it.each(others)('uses the approved same-tick order against $actionType in either insertion order', (other) => {
    for (const order of [[tip, other], [other, tip]]) {
      const resolver = new PlayerActionResolver()
      order.forEach((intent) => resolver.capture(intent, 2))
      expect(resolver.select('a', 2)?.actionType).toBe(other.actionType === 'SPIKE' ? 'SPIKE' : 'TIP')
    }
  })

  it.each(others)('keeps older $actionType before a newer TIP, including exact expiration', (other) => {
    const resolver = new PlayerActionResolver()
    const older = resolver.capture(other, 3)
    const later = resolver.capture(tip, 4)
    expect(resolver.select('a', 8)).toBe(older)
    expect(resolver.select('a', 9)).toBe(later)
    expect(resolver.select('a', 10)).toBeNull()
  })

  it.each(others)('keeps an older TIP before a newer $actionType', (other) => {
    const resolver = new PlayerActionResolver()
    const older = resolver.capture(tip, 3)
    resolver.capture(other, 4)
    expect(resolver.select('a', 8)).toBe(older)
  })

  it('promotes TIP after exact SPIKE cancellation and preserves all other candidates', () => {
    const resolver = new PlayerActionResolver()
    const captures = [others[0], tip, ...others.slice(1)].map((intent) => resolver.capture(intent, 10)!)
    // SPIKE and TIP share airborne eligibility in the simulator. This resolver
    // cancellation case is intentionally independent of pose validation.
    expect(resolver.cancel(captures[0], 10)).toBe(true)
    expect(resolver.select('a', 10)).toBe(captures[1])
    for (const capture of captures.slice(1)) {
      expect(resolver.select('a', 10)).toBe(capture)
      expect(resolver.consume(capture, 10)).toBe(true)
      expect(resolver.consume(capture, 10)).toBe(false)
    }
    expect(resolver.select('a', 10)).toBeNull()
  })

  it('buffers ages zero through five without renewing held or released TIP', () => {
    const resolver = new PlayerActionResolver()
    const captured = resolver.capture(tip, 0)
    expect(resolver.select('a', 0)).toBe(captured)
    expect(resolver.capture({ ...tip, tipPressed: false }, 4)).toBeNull()
    expect(resolver.select('a', 5)).toBe(captured)
    expect(resolver.select('a', 6)).toBeNull()
  })

  it('replaces only TIP and rejects stale/copy captures without affecting another player', () => {
    const resolver = new PlayerActionResolver()
    const first = resolver.capture(tip, 0)!
    const pass = resolver.capture(others[2], 1)
    const playerB = resolver.capture({ ...tip, playerId: 'b', teamSide: 'B' }, 1)
    const replacement = resolver.capture({ ...tip, aimLateral: -1 }, 2)!
    expect(Object.isFrozen(replacement)).toBe(true)
    expect(resolver.cancel(first, 2)).toBe(false)
    expect(resolver.consume({ ...replacement }, 2)).toBe(false)
    expect(resolver.select('a', 2)).toBe(pass)
    expect(resolver.select('b', 2)).toBe(playerB)
    expect(resolver.cancel(replacement, 2)).toBe(true)
    expect(resolver.select('a', 2)).toBe(pass)
    expect(resolver.select('a', 7)).toBeNull()
  })

  it('invalidates old TIP references on reset even when a new capture has identical values', () => {
    const resolver = new PlayerActionResolver()
    const old = resolver.capture(tip, 0)!
    resolver.reset()
    const current = resolver.capture(tip, 0)
    expect(resolver.cancel(old, 0)).toBe(false)
    expect(resolver.consume(old, 0)).toBe(false)
    expect(resolver.select('a', 0)).toBe(current)
  })
})
