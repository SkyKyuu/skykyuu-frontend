/** Approved F3.5B tuning: distances in metres, times in seconds and speeds in m/s. */
import { INDOOR_COURT } from '@/game/court/indoorCourtDimensions'

export const TIP_PHYSICS_CONFIG = {
  minTargetDepth: 0.80,
  nominalTargetDepth: 1.90,
  maxTargetDepth: INDOOR_COURT.attackLineDistance,
  maxLateralDisplacement: 2.00,
  minFlightTime: 0.55,
  nominalFlightTime: 0.95,
  maxFlightTime: 1.35,
  maxSpeed: 8.00,
  maxApexHeight: 3.60,
  netVerticalMargin: 0.025,
  antennaLateralMargin: 0.020,
  incomingVelocityRetention: 0,
  timingPhysicsEffect: 'NONE',
  numericalTolerance: 1e-9,
  targetAdjustment: 'FORBIDDEN',
  infeasiblePolicy: 'REJECT_AND_RESELECT',
} as const
