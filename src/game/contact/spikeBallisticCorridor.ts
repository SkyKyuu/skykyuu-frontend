import { VOLLEYBALL_CONFIG } from '@/game/ball/volleyballConfig'
import { VOLLEYBALL_SIMULATION_CONFIG } from '@/game/ball/volleyballSimulationConfig'
import { INDOOR_COURT } from '@/game/court/indoorCourtDimensions'
import { INDOOR_NET, INDOOR_NET_HEIGHTS } from '@/game/net/indoorNetDimensions'

export type SpikeTrajectory =
  | Readonly<{
      trajectoryMode: 'MODEL_C'
      corridor: Readonly<{ vMin: number; vMax: number; selectedVy: number }>
    }>
  | Readonly<{
      trajectoryMode: 'BASELINE_B_FALLBACK'
      fallbackReason: 'INVALID_GEOMETRY' | 'NO_ADMISSIBLE_CORRIDOR'
    }>

const INVALID_GEOMETRY: SpikeTrajectory = Object.freeze({
  trajectoryMode: 'BASELINE_B_FALLBACK',
  fallbackReason: 'INVALID_GEOMETRY',
})
const NO_CORRIDOR: SpikeTrajectory = Object.freeze({
  trajectoryMode: 'BASELINE_B_FALLBACK',
  fallbackReason: 'NO_ADMISSIBLE_CORRIDOR',
})

/** Solves in team-local space. Distance is measured from the attacking side to the net. */
export function solveSpikeBallisticCorridor(
  height: number,
  distanceToNet: number,
  forwardSpeed: number,
): SpikeTrajectory {
  const { radius } = VOLLEYBALL_CONFIG
  const { gravity } = VOLLEYBALL_SIMULATION_CONFIG
  if (
    ![height, distanceToNet, forwardSpeed].every(Number.isFinite) ||
    height <= radius || distanceToNet < 0 || forwardSpeed <= 0
  ) return INVALID_GEOMETRY

  const netEnvelope = radius + INDOOR_NET.bandDepth / 2
  const clearanceHeight = INDOOR_NET_HEIGHTS.men + radius
  const opponentEnd = INDOOR_COURT.halfLength - radius
  const tEntry = Math.max(0, (distanceToNet - netEnvelope) / forwardSpeed)
  const tExit = (distanceToNet + netEnvelope) / forwardSpeed
  const tEnd = (distanceToNet + opponentEnd) / forwardSpeed
  if (!(tExit > tEntry && tEnd > tExit && Number.isFinite(tEnd))) return INVALID_GEOMETRY
  if (tEntry === 0 && height < clearanceHeight) return NO_CORRIDOR

  // The concave trajectory clears the whole envelope when both endpoints clear it.
  const requiredVy = (time: number) => (clearanceHeight - height) / time + 0.5 * gravity * time
  const exitVy = requiredVy(tExit)
  const vMin = tEntry === 0 ? exitVy : Math.max(requiredVy(tEntry), exitVy)
  const vMax = (radius - height) / tEnd + 0.5 * gravity * tEnd
  if (!Number.isFinite(vMin) || !Number.isFinite(vMax)) return INVALID_GEOMETRY
  if (vMin > vMax) return NO_CORRIDOR

  const selectedVy = (vMin + vMax) / 2
  const tGround = (
    selectedVy + Math.sqrt(selectedVy ** 2 + 2 * gravity * (height - radius))
  ) / gravity
  if (!Number.isFinite(tGround)) return INVALID_GEOMETRY
  if (tGround <= tExit || tGround > tEnd) return NO_CORRIDOR

  return Object.freeze({
    trajectoryMode: 'MODEL_C',
    corridor: Object.freeze({ vMin, vMax, selectedVy }),
  })
}
