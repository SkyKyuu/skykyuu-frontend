/// <reference types="node" />
import { describe, expect, it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { env } from 'node:process'
import { solveTipBallisticTrajectory } from '@/game/contact/tipBallisticSolver'

// The reference deliberately imports no production physics constants or solver helpers.
// These literals are the independently approved F3.5B contract, not additional tuning.
const RADIUS = 0.105
const GRAVITY = 9.81
const NET_HEIGHT = 2.43
const REQUIRED_CENTER_HEIGHT = 2.56
const NET_ENVELOPE = 0.1175
const TARGET_X_LIMIT = 4.395
const ANTENNA_LIMIT = 4.37
const MIN_TIME = 0.55
const MAX_TIME = 1.35
const MAX_SPEED = 8
const MAX_APEX = 3.6
const PHYSICAL_TOLERANCE = 1e-9

const localXs = [-4.5, -4.395, -4.37, -2, 0, 2, 4.37, 4.395, 4.5]
const heights = [RADIUS, 1.8, 2.3, 2.535, 2.56, 2.65, 3.2, MAX_APEX]
const distances = [0, 0.05, NET_ENVELOPE, 0.25, 0.5, 1, 2, 4]
const aims = [-1, -0.5, 0, 0.5, 1]

interface ReferenceCase {
  readonly team: 'A' | 'B'
  readonly localX: number
  readonly height: number
  readonly distance: number
  readonly lateral: number
  readonly forward: number
}

interface ReferenceGeometry {
  readonly x0: number
  readonly z0: number
  readonly targetX: number
  readonly targetZ: number
  readonly entry: number
  readonly exit: number
  readonly height: number
}

function requestedGeometry(sample: ReferenceCase): ReferenceGeometry | null {
  const side = sample.team === 'A' ? 1 : -1
  const depth = 1.9 + 1.1 * sample.forward
  const x0 = side * sample.localX
  const z0 = -side * sample.distance
  const targetX = x0 + side * 2 * sample.lateral
  const targetZ = side * depth
  const length = sample.distance + depth
  const entry = Math.max(0, (sample.distance - NET_ENVELOPE) / length)
  const exit = (sample.distance + NET_ENVELOPE) / length

  // Only operation-scale floating roundoff is admitted by the reference search.
  // The wider, approved 1e-9 physical tolerance is reserved for result validation.
  const metresRoundoff = 32 * Number.EPSILON * Math.max(1, Math.abs(targetX))
  if (
    sample.height <= RADIUS || sample.height > MAX_APEX || sample.distance < 0 ||
    depth < 0.8 - metresRoundoff || depth > 3 + metresRoundoff ||
    Math.abs(targetX) > TARGET_X_LIMIT + metresRoundoff ||
    !(0 <= entry && entry < exit && exit < 1)
  ) return null

  for (const fraction of [entry, exit]) {
    const x = x0 + (targetX - x0) * fraction
    if (Math.abs(x) > ANTENNA_LIMIT + metresRoundoff) return null
  }
  return { x0, z0, targetX, targetZ, entry, exit, height: sample.height }
}

function referenceVelocity(geometry: ReferenceGeometry, time: number) {
  return {
    x: (geometry.targetX - geometry.x0) / time,
    y: (RADIUS - geometry.height) / time + GRAVITY * time / 2,
    z: (geometry.targetZ - geometry.z0) / time,
  }
}

function reconstructedHeight(geometry: ReferenceGeometry, time: number, fraction: number): number {
  const velocity = referenceVelocity(geometry, time)
  const elapsed = time * fraction
  return geometry.height + velocity.y * elapsed - GRAVITY * elapsed * elapsed / 2
}

function clearsNet(geometry: ReferenceGeometry, time: number): boolean {
  const roundoffMetres = 32 * Number.EPSILON * Math.max(1, geometry.height)
  return [geometry.entry, geometry.exit].every((fraction) =>
    reconstructedHeight(geometry, time, fraction) >= REQUIRED_CENTER_HEIGHT - roundoffMetres,
  )
}

function respectsApex(geometry: ReferenceGeometry, time: number): boolean {
  // Compare vertical speed against the energy ceiling instead of subtracting two
  // almost equal apex heights. No analytical time-bound formula is reused.
  const upwards = Math.max(referenceVelocity(geometry, time).y, 0)
  const permitted = Math.sqrt(2 * GRAVITY * (MAX_APEX - geometry.height))
  const roundoffMps = 32 * Number.EPSILON * Math.max(1, upwards, permitted)
  return upwards <= permitted + roundoffMps
}

function referenceSpeed(geometry: ReferenceGeometry, time: number): number {
  const velocity = referenceVelocity(geometry, time)
  return Math.hypot(velocity.x, velocity.y, velocity.z)
}

function withinSpeed(geometry: ReferenceGeometry, time: number): boolean {
  return referenceSpeed(geometry, time) <= MAX_SPEED + 32 * Number.EPSILON * MAX_SPEED
}

function coarseGridFeasible(geometry: ReferenceGeometry): boolean {
  // A deliberately finite initial witness grid. Its misses are counted and then
  // checked against the independent continuous numerical search below.
  for (let index = 0; index <= 64; index += 1) {
    const time = MIN_TIME + (MAX_TIME - MIN_TIME) * index / 64
    if (clearsNet(geometry, time) && respectsApex(geometry, time) && withinSpeed(geometry, time)) {
      return true
    }
  }
  return false
}

function continuousNumericalFeasibility(geometry: ReferenceGeometry): boolean {
  // For a fixed destination, net clearance grows with T and the apex never
  // decreases. Bracket their boundaries directly, without algebraic T roots.
  if (!clearsNet(geometry, MAX_TIME) || !respectsApex(geometry, MIN_TIME)) return false
  let minimum = MIN_TIME
  let maximum = MAX_TIME
  if (!clearsNet(geometry, minimum)) {
    let left = minimum
    let right = maximum
    for (let iteration = 0; iteration < 80; iteration += 1) {
      const middle = (left + right) / 2
      if (clearsNet(geometry, middle)) right = middle
      else left = middle
    }
    minimum = right
  }
  if (!respectsApex(geometry, maximum)) {
    let left = MIN_TIME
    let right = maximum
    for (let iteration = 0; iteration < 80; iteration += 1) {
      const middle = (left + right) / 2
      if (respectsApex(geometry, middle)) left = middle
      else right = middle
    }
    maximum = left
  }
  if (minimum > maximum) return false

  // Speed squared, reconstructed from velocity components, is strictly convex
  // for positive T. A numerical minimum witnesses any feasible speed interval,
  // including an interval narrower than the coarse grid spacing.
  let left = minimum
  let right = maximum
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const first = left + (right - left) / 3
    const second = right - (right - left) / 3
    if (referenceSpeed(geometry, first) <= referenceSpeed(geometry, second)) right = second
    else left = first
  }
  const witness = (left + right) / 2
  return [minimum, witness, maximum].some((time) =>
    clearsNet(geometry, time) && respectsApex(geometry, time) && withinSpeed(geometry, time),
  )
}

describe('independent TIP mathematical validation', () => {
  it('reconstructs all accepted trajectories and refines finite-grid misses over 28,800 cases', () => {
    let total = 0
    let accepted = 0
    let falseAcceptances = 0
    let rawGridDisagreements = 0
    let refinedGridMisses = 0
    let feasibilityDisagreements = 0
    let offensiveCases = 0
    let offensiveAccepted = 0
    let maxLandingError = 0
    let maxSpeed = 0
    let maxApex = 0
    let minNetClearance = Infinity
    let maxSelectedTime = 0
    const rejections: Record<string, number> = {}
    const problems: { sample: ReferenceCase; kind: string }[] = []
    const discrepancies: { sample: ReferenceCase; productionAccepted: boolean; referenceFeasible: boolean }[] = []

    for (const team of ['A', 'B'] as const) {
      for (const localX of localXs) for (const height of heights) for (const distance of distances) {
        for (const lateral of aims) for (const forward of aims) {
          const sample: ReferenceCase = { team, localX, height, distance, lateral, forward }
          const side = team === 'A' ? 1 : -1
          const position = Object.freeze({ x: side * localX, y: height, z: -side * distance })
          const result = solveTipBallisticTrajectory(position, team, lateral, forward)
          const productionAccepted = result.status === 'ADMISSIBLE_TRAJECTORY'
          const geometry = requestedGeometry(sample)
          const gridFeasible = geometry !== null && coarseGridFeasible(geometry)
          const referenceFeasible = geometry !== null && continuousNumericalFeasibility(geometry)
          const offensive = Math.abs(localX) <= 2 && height >= 2.56 && distance <= 2
          total += 1
          if (offensive) offensiveCases += 1
          if (gridFeasible !== productionAccepted) rawGridDisagreements += 1
          if (!gridFeasible && referenceFeasible) refinedGridMisses += 1
          if (referenceFeasible !== productionAccepted) {
            feasibilityDisagreements += 1
            if (discrepancies.length < 30) discrepancies.push({ sample, productionAccepted, referenceFeasible })
          }
          if (result.status === 'REJECTED') {
            rejections[result.reason] = (rejections[result.reason] ?? 0) + 1
            continue
          }
          accepted += 1
          if (offensive) offensiveAccepted += 1

          const errors: string[] = []
          const check = (condition: boolean, name: string) => { if (!condition) errors.push(name) }
          const time = result.selectedFlightTime
          const velocity = result.outgoingVelocity
          const target = { x: position.x + side * 2 * lateral, y: RADIUS, z: side * (1.9 + 1.1 * forward) }
          const speed = Math.hypot(velocity.x, velocity.y, velocity.z)
          const apex = height + Math.max(velocity.y, 0) ** 2 / (2 * GRAVITY)
          const landing = {
            x: position.x + velocity.x * time,
            y: height + velocity.y * time - GRAVITY * time * time / 2,
            z: position.z + velocity.z * time,
          }
          const landingError = Math.hypot(landing.x - target.x, landing.y - target.y, landing.z - target.z)
          const groundTime = 2 * (height - RADIUS) /
            (Math.sqrt(velocity.y * velocity.y + 2 * GRAVITY * (height - RADIUS)) - velocity.y)
          check(geometry !== null, 'valid requested geometry and unchanged target region')
          check(Object.values(velocity).every(Number.isFinite), 'finite velocity')
          check(side * velocity.z > 0, 'strictly forward in team coordinates')
          check(time >= MIN_TIME - PHYSICAL_TOLERANCE && time <= MAX_TIME + PHYSICAL_TOLERANCE, 'flight time bounds')
          check(speed <= MAX_SPEED + PHYSICAL_TOLERANCE, 'speed ceiling')
          check(apex <= MAX_APEX + PHYSICAL_TOLERANCE, 'apex ceiling')
          check(landingError <= PHYSICAL_TOLERANCE, 'landing at requested destination')
          check(Math.abs(groundTime - time) <= PHYSICAL_TOLERANCE, 'independent ground root')
          check(velocity.y - GRAVITY * groundTime < 0, 'descending ground contact')
          check(Math.hypot(result.targetPosition.x - target.x, result.targetPosition.y - target.y, result.targetPosition.z - target.z) <= PHYSICAL_TOLERANCE, 'target was not adjusted')
          check(Math.abs(result.initialSpeed - speed) <= PHYSICAL_TOLERANCE, 'speed telemetry')
          check(Math.abs(result.apexHeight - apex) <= PHYSICAL_TOLERANCE, 'apex telemetry')
          const { min, max } = result.admissibleTimeInterval
          check(min <= max && time >= min - PHYSICAL_TOLERANCE && time <= max + PHYSICAL_TOLERANCE, 'admissible interval contains selection')
          check(Math.abs(time - Math.min(max, Math.max(min, 0.95))) <= PHYSICAL_TOLERANCE, 'deterministic nominal-time projection')
          check(Object.isFrozen(result) && Object.isFrozen(result.targetPosition) && Object.isFrozen(velocity) && Object.isFrozen(result.admissibleTimeInterval), 'nested immutable result')
          if (geometry) {
            for (const [index, fraction] of [geometry.entry, geometry.exit].entries()) {
              const elapsed = fraction * time
              const centerHeight = height + velocity.y * elapsed - GRAVITY * elapsed * elapsed / 2
              const bottomClearance = centerHeight - RADIUS - NET_HEIGHT
              const horizontal = position.x + velocity.x * elapsed
              const observedClearance = index === 0 ? result.netEntryClearance : result.netExitClearance
              check(centerHeight >= REQUIRED_CENTER_HEIGHT - PHYSICAL_TOLERANCE, 'vertical net envelope')
              check(Math.abs(horizontal) <= ANTENNA_LIMIT + PHYSICAL_TOLERANCE, 'lateral antenna envelope')
              check(Math.abs(bottomClearance - observedClearance) <= PHYSICAL_TOLERANCE, 'net clearance telemetry')
              minNetClearance = Math.min(minNetClearance, bottomClearance)
            }
            check(geometry.exit * time < groundTime, 'net exit precedes landing')
          }
          if (errors.length > 0) {
            falseAcceptances += 1
            if (problems.length < 30) problems.push({ sample, kind: errors.join(', ') })
          }
          maxLandingError = Math.max(maxLandingError, landingError)
          maxSpeed = Math.max(maxSpeed, speed)
          maxApex = Math.max(maxApex, apex)
          maxSelectedTime = Math.max(maxSelectedTime, time)
        }
      }
    }

    const report = {
      matrix: { teams: ['A', 'B'], localXs, heights, distances, lateralAims: aims, forwardAims: aims },
      reference: '65-point initial time grid; independent direct-flight net/apex bisections80 and convex speed minimization100; no production helpers or quadratic time roots',
      physicalTolerance: PHYSICAL_TOLERANCE,
      totalCases: total,
      acceptedCases: accepted,
      rejectionsByReason: rejections,
      falseAcceptanceCount: falseAcceptances,
      initialGridFeasibilityDisagreements: rawGridDisagreements,
      narrowIntervalsRecoveredByNumericalRefinement: refinedGridMisses,
      feasibilityDisagreements,
      maxLandingErrorMetres: maxLandingError,
      maxAcceptedSpeedMps: maxSpeed,
      maxAcceptedApexMetres: maxApex,
      minimumNetBottomClearanceMetres: minNetClearance,
      maxSelectedFlightTimeSeconds: maxSelectedTime,
      offensiveRegion: { definition: '|localX|<=2, height>=2.56, distance<=2', cases: offensiveCases, accepted: offensiveAccepted, acceptedFraction: offensiveAccepted / offensiveCases },
      problems,
      discrepancies,
    }
    // Optional evidence output is supplied by the caller outside the repository;
    // normal regression runs create no report files.
    if (env.SKYKYUU_TIP_MATH_REPORT) {
      writeFileSync(env.SKYKYUU_TIP_MATH_REPORT, JSON.stringify(report, null, 2))
    }
    console.info('TIP_NUMERICAL_VALIDATION', JSON.stringify(report))
    expect(total).toBe(28_800)
    expect(accepted).toBeGreaterThan(0)
    expect(offensiveCases).toBe(4_200)
    expect(offensiveAccepted).toBeGreaterThan(0)
    expect(falseAcceptances, JSON.stringify(problems)).toBe(0)
    expect(feasibilityDisagreements, JSON.stringify(discrepancies)).toBe(0)
  }, 30_000)
})
