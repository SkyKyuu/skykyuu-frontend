import { describe, expect, it } from 'vitest'
import { PlayerActionResolver, type PlayerCommandIntent } from '@/game/actions/playerActionResolver'
import type { SpikeIntent } from '@/game/actions/spikeIntent'

const spike: SpikeIntent = {
  actionType: 'SPIKE', playerId: 'a', teamSide: 'A', spikePressed: true, aimLateral: 0, aimForward: 0,
}
const legacy: PlayerCommandIntent[] = [
  { ...spike, actionType: 'SET', setHeld: true, setPressed: true },
  { ...spike, actionType: 'FOREARM_PASS', forearmPassHeld: true, forearmPassPressed: true },
  { ...spike, actionType: 'GENERIC_HIT', hitHeld: true, hitPressed: true },
]

describe('SPIKE resolver arbitration', () => {
  it.each(legacy)('wins an equal-tick tie with $actionType in either input order', (candidate) => {
    for (const order of [[candidate, spike], [spike, candidate]]) {
      const resolver = new PlayerActionResolver()
      const captured = order.map((intent) => resolver.capture(intent, 2))
      expect(resolver.select('a', 2)).toBe(captured[order.indexOf(spike)])
    }
  })

  it('promotes SET, PASS and HIT after canceling SPIKE in an all-four tie', () => {
    const resolver = new PlayerActionResolver()
    const captures = [...legacy, spike].map((intent) => resolver.capture(intent, 10)!)
    expect(resolver.cancel(captures[3], 10)).toBe(true)
    for (const candidate of captures.slice(0, 3)) {
      expect(resolver.select('a', 10)).toBe(candidate)
      expect(resolver.consume(candidate, 10)).toBe(true)
    }
    expect(resolver.select('a', 10)).toBeNull()
  })

  it.each(legacy)('prioritizes an older $actionType over a newer SPIKE', (intent) => {
    const resolver = new PlayerActionResolver()
    const older = resolver.capture(intent, 4)!
    const newer = resolver.capture(spike, 5)
    expect(resolver.select('a', 9)).toBe(older)
    expect(resolver.select('a', 10)).toBe(newer)
    expect(resolver.select('a', 11)).toBeNull()
  })

  it('keeps older SPIKE ahead of SET and honors age zero, five and six', () => {
    const resolver = new PlayerActionResolver()
    const older = resolver.capture(spike, 1)
    expect(resolver.select('a', 1)).toBe(older)
    const newer = resolver.capture(legacy[0], 2)
    expect(resolver.select('a', 6)).toBe(older)
    expect(resolver.select('a', 7)).toBe(newer)
  })

  it('replaces by exact snapshot, leaves other players intact and clears on reset', () => {
    const resolver = new PlayerActionResolver()
    const old = resolver.capture(spike, 5)!
    const other = resolver.capture({ ...spike, playerId: 'b', teamSide: 'B' }, 5)!
    const replacement = resolver.capture({ ...spike, aimForward: 1 }, 5)!
    expect(Object.isFrozen(replacement)).toBe(true)
    expect(resolver.capture({ ...spike, spikePressed: false }, 5)).toBeNull()
    expect(resolver.cancel(old, 5)).toBe(false)
    expect(resolver.consume({ ...replacement }, 5)).toBe(false)
    expect(resolver.select('a', 5)).toBe(replacement)
    expect(resolver.consume(replacement, 5)).toBe(true)
    expect(resolver.consume(replacement, 5)).toBe(false)
    expect(resolver.select('b', 5)).toBe(other)
    resolver.reset()
    expect(resolver.selectAll(0)).toEqual([])
    expect(resolver.cancel(other, 0)).toBe(false)
  })
})
