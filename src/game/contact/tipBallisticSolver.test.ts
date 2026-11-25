import { describe, expect, it } from 'vitest'
import type { BallVector3 } from '@/game/ball/volleyballState'
import { solveTipBallisticTrajectory, type AdmissibleTipTrajectory } from '@/game/contact/tipBallisticSolver'
import type { TeamSide } from '@/game/team/teamTypes'

const contact = { x: 0, y: 2.65, z: -0.50 }
const rejected = (reason: string) => ({ status: 'REJECTED', reason })

function solve(
  position: BallVector3 = contact,
  side: TeamSide = 'A',
  lateral = 0,
  forward = 0,
): AdmissibleTipTrajectory {
  const result = solveTipBallisticTrajectory(position, side, lateral, forward)
  expect(result.status).toBe('ADMISSIBLE_TRAJECTORY')
  if (result.status !== 'ADMISSIBLE_TRAJECTORY') throw new Error(JSON.stringify(result))
  return result
}

describe('TIP analytical ballistic trajectory', () => {
  it('matches the fully specified nominal reference independently of the solver', () => {
    const result = solve()
    const time = 0.95
    const vy = (0.105 - 2.65) / time + 9.81 * time / 2
    const vz = 2.40 / time
    expect(result.targetPosition).toEqual({ x: 0, y: 0.105, z: 1.90 })
    expect(result.selectedFlightTime).toBe(time)
    expect(result.outgoingVelocity).toEqual({ x: 0, y: vy, z: vz })
    expect(result.initialSpeed).toBeCloseTo(Math.hypot(vy, vz), 12)
    expect(result.apexHeight).toBeCloseTo(2.65 + vy * vy / (2 * 9.81), 12)
    const entryTime = (0.50 - 0.1175) / vz
    const exitTime = (0.50 + 0.1175) / vz
    expect(result.netEntryClearance).toBeCloseTo(2.65 + vy * entryTime - 9.81 * entryTime ** 2 / 2 - 0.105 - 2.43, 12)
    expect(result.netExitClearance).toBeCloseTo(2.65 + vy * exitTime - 9.81 * exitTime ** 2 / 2 - 0.105 - 2.43, 12)
    expect(result.admissibleTimeInterval.min).toBeLessThanOrEqual(time)
    expect(result.admissibleTimeInterval.max).toBeGreaterThanOrEqual(time)
  })

  it.each([-1, 0, 1])('uses forward aim %s without adjusting its requested destination', (forward) => {
    const result = solve(contact, 'A', 0, forward)
    expect(result.targetPosition.z).toBe(1.90 + 1.10 * forward)
    expect(result.targetPosition.x).toBe(contact.x)
    expect(result.targetPosition.y).toBe(0.105)
  })

  it.each([-1, -0.5, 0, 0.5, 1])('maps lateral aim %s from the ball center, independently of the player', (lateral) => {
    const result = solve({ x: 0.35, y: 2.65, z: -0.50 }, 'A', lateral)
    expect(result.targetPosition.x).toBe(0.35 + 2 * lateral)
  })

  it.each([-1, 0, 1])('mirrors teams exactly in horizontal geometry at forward aim %s', (forward) => {
    const a = solve({ x: 0.4, y: 2.65, z: -0.5 }, 'A', 0.7, forward)
    const b = solve({ x: -0.4, y: 2.65, z: 0.5 }, 'B', 0.7, forward)
    expect(b.selectedFlightTime).toBe(a.selectedFlightTime)
    expect(b.admissibleTimeInterval).toEqual(a.admissibleTimeInterval)
    expect(b.targetPosition).toEqual({ x: -a.targetPosition.x, y: a.targetPosition.y, z: -a.targetPosition.z })
    expect(b.outgoingVelocity).toEqual({ x: -a.outgoingVelocity.x, y: a.outgoingVelocity.y, z: -a.outgoingVelocity.z })
    expect(b.apexHeight).toBe(a.apexHeight)
    expect(b.initialSpeed).toBe(a.initialSpeed)
    expect(b.netEntryClearance).toBe(a.netEntryClearance)
    expect(b.netExitClearance).toBe(a.netExitClearance)
  })

  it.each([0, 0.05875, 0.1175])('allows valid geometry at distance %s including the net plane', (distance) => {
    const result = solve({ x: 0, y: 2.65, z: -distance })
    expect(result.netEntryClearance).toBeGreaterThanOrEqual(0.025 - 1e-9)
    expect(result.netExitClearance).toBeGreaterThanOrEqual(0.025 - 1e-9)
  })

  it.each([0, 0.05875, 0.1175])('rejects an initial height below clearance inside the envelope at distance %s', (distance) => {
    expect(solveTipBallisticTrajectory({ x: 0, y: 2.559, z: -distance }, 'A', 0, 0))
      .toEqual(rejected('NO_ADMISSIBLE_TRAJECTORY'))
  })

  it('supports exact initial clearance without introducing a denominator floor', () => {
    const result = solve({ x: 0, y: 2.560, z: 0 })
    expect(result.netEntryClearance).toBeCloseTo(0.025, 12)
  })

  it('allows a lower contact to rise before reaching the net envelope', () => {
    const result = solve({ x: 0, y: 2.4, z: -1 })
    expect(result.outgoingVelocity.y).toBeGreaterThan(0)
    expect(result.netExitClearance).toBeGreaterThanOrEqual(0.025 - 1e-9)
  })

  it.each([
    { x: 0, y: 0.105, z: -0.5 },
    { x: 0, y: 0, z: -0.5 },
    { x: 0, y: 2.65, z: 0.000001 },
    { x: NaN, y: 2.65, z: -0.5 },
    { x: 0, y: Infinity, z: -0.5 },
    { x: 0, y: 2.65, z: -Infinity },
  ])('rejects invalid geometry %j', (position) => {
    expect(solveTipBallisticTrajectory(position, 'A', 0, 0)).toEqual(rejected('INVALID_GEOMETRY'))
  })

  it('rejects an invalid team instead of guessing its orientation', () => {
    expect(solveTipBallisticTrajectory(contact, 'UNKNOWN' as TeamSide, 0, 0))
      .toEqual(rejected('INVALID_GEOMETRY'))
  })

  it.each([NaN, Infinity, -Infinity, -1.000001, 1.000001])('preserves strict validation of invalid aim %s', (aim) => {
    expect(() => solveTipBallisticTrajectory(contact, 'A', aim, 0)).toThrow(RangeError)
    expect(() => solveTipBallisticTrajectory(contact, 'A', 0, aim)).toThrow(RangeError)
  })

  it('accepts the exact conservative court target and rejects a target beyond it without clamping', () => {
    const inside = solve({ x: 2.395, y: 2.65, z: -0.5 }, 'A', 1)
    expect(inside.targetPosition.x).toBe(2.395 + 2)
    expect(solveTipBallisticTrajectory({ x: 2.395001, y: 2.65, z: -0.5 }, 'A', 1, 0))
      .toEqual(rejected('INVALID_TARGET'))
  })

  it.each([-1, 1])('checks the antenna boundary on side %s even above the visible antenna', (sign) => {
    const result = solve({ x: sign * 4.370, y: 2.65, z: -0.5 })
    expect(result.targetPosition.x).toBe(sign * 4.370)
    expect(solveTipBallisticTrajectory({ x: sign * 4.370001, y: 3.6, z: -0.5 }, 'A', 0, 0))
      .toEqual(rejected('NO_ADMISSIBLE_TRAJECTORY'))
  })

  it('includes the approved minimum time bound and selects the exact maximum-apex boundary', () => {
    const result = solve({ x: 0, y: 3.6, z: 0 })
    expect(result.admissibleTimeInterval.min).toBe(0.55)
    expect(result.selectedFlightTime).toBeCloseTo(Math.sqrt(2 * (3.6 - 0.105) / 9.81), 12)
    expect(result.apexHeight).toBeCloseTo(3.6, 12)
    expect(solveTipBallisticTrajectory({ x: 0, y: 3.600001, z: 0 }, 'A', 0, 0))
      .toEqual(rejected('NO_ADMISSIBLE_TRAJECTORY'))
  })

  it('intersects the flight-time maximum without sampling times or changing targets', () => {
    // Independent equation y(lambda)=2.560 at T=1.35, y0=1.5.
    const curve = 9.81 * 1.35 ** 2 / 2
    const linear = curve + 0.105 - 1.5
    const fraction = (linear + Math.sqrt(linear ** 2 - 4 * curve * (2.560 - 1.5))) / (2 * curve)
    const boundaryDistance = (fraction * 1.90 - 0.1175) / (1 - fraction)
    const result = solve({ x: 0, y: 1.5, z: -(boundaryDistance - 1e-7) })
    expect(result.admissibleTimeInterval.max).toBe(1.35)
    expect(result.selectedFlightTime).toBeGreaterThan(1.3499999)
    expect(result.selectedFlightTime).toBeLessThanOrEqual(1.35)
    expect(solveTipBallisticTrajectory({ x: 0, y: 1.5, z: -(boundaryDistance + 1e-5) }, 'A', 0, 0))
      .toEqual(rejected('NO_ADMISSIBLE_TRAJECTORY'))
  })

  it('rejects the infeasible side of the maximum-speed boundary without clamping velocity', () => {
    const near = solve({ x: 0, y: 1.5, z: -4.785 }, 'A', 0, 1)
    expect(near.initialSpeed).toBeGreaterThan(7.9999)
    expect(near.initialSpeed).toBeLessThanOrEqual(8 + 1e-9)
    expect(solveTipBallisticTrajectory({ x: 0, y: 1.5, z: -4.786 }, 'A', 0, 1))
      .toEqual(rejected('NO_ADMISSIBLE_TRAJECTORY'))
  })

  it.each([-1e-12, 0, 1e-12])('handles a nearly tangent speed discriminant with perturbation %s', (delta) => {
    const height = 1.5 - 0.105
    const b = 8 ** 2 + 9.81 * height
    const horizontalDistance = Math.sqrt(b ** 2 / 9.81 ** 2 - height ** 2)
    const result = solveTipBallisticTrajectory({ x: 0, y: 1.5, z: -(horizontalDistance - 3 + delta) }, 'A', 0, 1)
    // The net constraint eliminates this tangent speed interval, independently
    // of whether floating-point D is tiny positive or tiny negative.
    expect(result).toEqual(rejected('NO_ADMISSIBLE_TRAJECTORY'))
    expect(Object.isFrozen(result)).toBe(true)
  })

  it('returns a detached, deeply immutable plan that reconstructs a downward landing', () => {
    const source = { ...contact }
    const result = solve(source, 'A', 0.5, -0.5)
    source.x = 100
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.targetPosition)).toBe(true)
    expect(Object.isFrozen(result.outgoingVelocity)).toBe(true)
    expect(Object.isFrozen(result.admissibleTimeInterval)).toBe(true)
    const t = result.selectedFlightTime
    const v = result.outgoingVelocity
    expect(contact.x + v.x * t).toBeCloseTo(result.targetPosition.x, 12)
    expect(contact.y + v.y * t - 9.81 * t * t / 2).toBeCloseTo(result.targetPosition.y, 12)
    expect(contact.z + v.z * t).toBeCloseTo(result.targetPosition.z, 12)
    expect(v.y - 9.81 * t).toBeLessThan(0)
  })
})
