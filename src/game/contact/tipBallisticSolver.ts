import { VOLLEYBALL_CONFIG } from '@/game/ball/volleyballConfig'
import { VOLLEYBALL_SIMULATION_CONFIG } from '@/game/ball/volleyballSimulationConfig'
import type { BallVector3 } from '@/game/ball/volleyballState'
import { validatePlayerHitAimForward, validatePlayerHitAimLateral } from '@/game/contact/playerHitAim'
import { TIP_PHYSICS_CONFIG as config } from '@/game/contact/tipPhysicsConfig'
import { INDOOR_COURT } from '@/game/court/indoorCourtDimensions'
import { INDOOR_NET, INDOOR_NET_HEIGHTS } from '@/game/net/indoorNetDimensions'
import type { TeamSide } from '@/game/team/teamTypes'

export type TipTrajectoryRejectionReason =
  | 'INVALID_GEOMETRY'
  | 'INVALID_TARGET'
  | 'NO_ADMISSIBLE_TRAJECTORY'

export interface AdmissibleTipTrajectory {
  readonly status: 'ADMISSIBLE_TRAJECTORY'
  readonly targetPosition: Readonly<BallVector3>
  readonly selectedFlightTime: number
  readonly admissibleTimeInterval: Readonly<{ min: number; max: number }>
  readonly outgoingVelocity: Readonly<BallVector3>
  readonly initialSpeed: number
  readonly apexHeight: number
  /** Vertical distance from the bottom of the ball to the net top, in metres. */
  readonly netEntryClearance: number
  readonly netExitClearance: number
}

export type TipTrajectoryResult = AdmissibleTipTrajectory | Readonly<{
  status: 'REJECTED'
  reason: TipTrajectoryRejectionReason
}>

const INVALID_GEOMETRY = Object.freeze({ status: 'REJECTED', reason: 'INVALID_GEOMETRY' } as const)
const INVALID_TARGET = Object.freeze({ status: 'REJECTED', reason: 'INVALID_TARGET' } as const)
const NO_TRAJECTORY = Object.freeze({ status: 'REJECTED', reason: 'NO_ADMISSIBLE_TRAJECTORY' } as const)

/**
 * Solves only TIP's launch velocity, without changing the requested destination.
 * Invalid aim follows the existing RangeError contract. Rejection order after
 * aim validation is geometry, target, then physical feasibility.
 *
 * The 1e-9 tolerance is used only for reconstructed metres, seconds and m/s.
 * Interval intersections are strict. The squared-speed discriminant instead
 * uses its own IEEE-754 operation-scale roundoff bound, in the same units as D;
 * a dimensionless gameplay epsilon is never added to squared quantities.
 */
export function solveTipBallisticTrajectory(
  ballPosition: Readonly<BallVector3>,
  teamSide: TeamSide,
  aimLateral: number,
  aimForward: number,
): TipTrajectoryResult {
  const lateral = validatePlayerHitAimLateral(aimLateral)
  const forward = validatePlayerHitAimForward(aimForward)
  const { x: x0, y: y0, z: z0 } = ballPosition
  const { radius } = VOLLEYBALL_CONFIG
  const { gravity } = VOLLEYBALL_SIMULATION_CONFIG
  const tolerance = config.numericalTolerance
  if (
    (teamSide !== 'A' && teamSide !== 'B') ||
    ![x0, y0, z0].every(Number.isFinite)
  ) return INVALID_GEOMETRY

  const sign = teamSide === 'A' ? 1 : -1
  const distanceToNet = sign * (INDOOR_NET.z - z0)
  if (distanceToNet < 0 || y0 <= radius) return INVALID_GEOMETRY

  const depthRange = (config.maxTargetDepth - config.minTargetDepth) / 2
  const depth = config.nominalTargetDepth + depthRange * forward
  const target = {
    x: x0 + sign * config.maxLateralDisplacement * lateral,
    y: radius,
    z: INDOOR_NET.z + sign * depth,
  }
  // These metre comparisons permit floating-point roundoff at exact boundaries;
  // the returned target is always the unmodified requested value.
  if (
    depth < config.minTargetDepth - tolerance || depth > config.maxTargetDepth + tolerance ||
    Math.abs(target.x) > INDOOR_COURT.halfWidth - radius + tolerance ||
    Math.abs(target.z - INDOOR_NET.z) > INDOOR_COURT.halfLength - radius + tolerance
  ) return INVALID_TARGET

  if (y0 > config.maxApexHeight) return NO_TRAJECTORY
  const height = y0 - radius
  const dx = target.x - x0
  const dz = target.z - z0
  const length = distanceToNet + depth
  const envelope = radius + INDOOR_NET.bandDepth / 2
  const requiredHeight = INDOOR_NET_HEIGHTS.men + radius + config.netVerticalMargin
  const entry = Math.max(0, (distanceToNet - envelope) / length)
  const exit = (distanceToNet + envelope) / length
  if (
    ![height, dx, dz, length, entry, exit].every(Number.isFinite) || length <= 0 ||
    !(entry >= 0 && entry < exit && exit < 1)
  ) return INVALID_GEOMETRY

  const antennaLimit = INDOOR_COURT.halfWidth - radius
    - INDOOR_NET.antennaDiameter / 2 - config.antennaLateralMargin
  for (const fraction of [entry, exit]) {
    if (Math.abs(x0 + dx * fraction) > antennaLimit + tolerance) return NO_TRAJECTORY
  }

  let minTime: number = config.minFlightTime
  let maxTime: number = config.maxFlightTime
  for (const fraction of [entry, exit]) {
    if (fraction === 0) {
      if (y0 < requiredHeight - tolerance) return NO_TRAJECTORY
      continue
    }
    const denominator = gravity * fraction * (1 - fraction)
    if (!(denominator > 0 && Number.isFinite(denominator))) return INVALID_GEOMETRY
    const requiredTimeSquared = 2 * (requiredHeight - (1 - fraction) * y0 - fraction * radius) / denominator
    if (!Number.isFinite(requiredTimeSquared)) return INVALID_GEOMETRY
    if (requiredTimeSquared > 0) minTime = Math.max(minTime, Math.sqrt(requiredTimeSquared))
  }

  const distanceSquared = dx * dx + dz * dz + height * height
  const a = gravity * gravity / 4
  const b = config.maxSpeed * config.maxSpeed + gravity * height
  const bSquared = b * b
  const fourAS = 4 * a * distanceSquared
  let discriminant = bSquared - fourAS
  if (![distanceSquared, bSquared, fourAS, discriminant].every(Number.isFinite)) return INVALID_GEOMETRY
  // Each term and subtraction contributes roundoff; this bound scales with
  // those operations and has D's units (m^4/s^4), not metres or seconds.
  const discriminantRoundoff = 4 * Number.EPSILON * (Math.abs(bSquared) + Math.abs(fourAS))
  if (discriminant < -discriminantRoundoff) return NO_TRAJECTORY
  discriminant = Math.max(0, discriminant)
  const rootSum = b + Math.sqrt(discriminant)
  const minTimeSquared = discriminant === 0 ? b / (2 * a) : 2 * distanceSquared / rootSum
  const maxTimeSquared = rootSum / (2 * a)
  if (
    ![minTimeSquared, maxTimeSquared].every(Number.isFinite) ||
    minTimeSquared <= 0 || maxTimeSquared <= 0
  ) return INVALID_GEOMETRY
  minTime = Math.max(minTime, Math.sqrt(minTimeSquared))
  maxTime = Math.min(maxTime, Math.sqrt(maxTimeSquared))

  const maxUpwardSpeed = Math.sqrt(2 * gravity * (config.maxApexHeight - y0))
  const apexTimeBound = (maxUpwardSpeed + Math.sqrt(maxUpwardSpeed * maxUpwardSpeed + 2 * gravity * height)) / gravity
  if (!Number.isFinite(apexTimeBound)) return INVALID_GEOMETRY
  maxTime = Math.min(maxTime, apexTimeBound)
  if (minTime > maxTime) return NO_TRAJECTORY

  const time = Math.min(maxTime, Math.max(minTime, config.nominalFlightTime))
  const velocity = {
    x: dx === 0 ? 0 : dx / time,
    y: (radius - y0) / time + gravity * time / 2,
    z: dz / time,
  }
  const speed = Math.hypot(velocity.x, velocity.y, velocity.z)
  const apex = y0 + Math.max(velocity.y, 0) ** 2 / (2 * gravity)
  const atTime = (t: number): BallVector3 => ({
    x: x0 + velocity.x * t,
    y: y0 + velocity.y * t - gravity * t * t / 2,
    z: z0 + velocity.z * t,
  })
  const entryPosition = atTime(entry * time)
  const exitPosition = atTime(exit * time)
  const entryClearance = entryPosition.y - radius - INDOOR_NET_HEIGHTS.men
  const exitClearance = exitPosition.y - radius - INDOOR_NET_HEIGHTS.men
  const impactRoot = Math.sqrt(velocity.y * velocity.y + 2 * gravity * height)
  const landingTime = velocity.y < 0
    ? 2 * height / (impactRoot - velocity.y)
    : (velocity.y + impactRoot) / gravity
  const landing = atTime(landingTime)
  if (
    ![...Object.values(velocity), speed, apex, entryClearance, exitClearance, landingTime,
      ...Object.values(landing)].every(Number.isFinite) ||
    sign * velocity.z <= 0 ||
    time < config.minFlightTime - tolerance || time > config.maxFlightTime + tolerance ||
    speed > config.maxSpeed + tolerance || apex > config.maxApexHeight + tolerance ||
    entryClearance < config.netVerticalMargin - tolerance ||
    exitClearance < config.netVerticalMargin - tolerance ||
    Math.abs(entryPosition.x) > antennaLimit + tolerance ||
    Math.abs(exitPosition.x) > antennaLimit + tolerance ||
    !(exit * time < landingTime) ||
    Math.abs(landingTime - time) > tolerance ||
    Math.hypot(landing.x - target.x, landing.y - target.y, landing.z - target.z) > tolerance ||
    velocity.y - gravity * landingTime >= 0
  ) return NO_TRAJECTORY

  return Object.freeze({
    status: 'ADMISSIBLE_TRAJECTORY',
    targetPosition: Object.freeze(target),
    selectedFlightTime: time,
    admissibleTimeInterval: Object.freeze({ min: minTime, max: maxTime }),
    outgoingVelocity: Object.freeze(velocity),
    initialSpeed: speed,
    apexHeight: apex,
    netEntryClearance: entryClearance,
    netExitClearance: exitClearance,
  })
}
