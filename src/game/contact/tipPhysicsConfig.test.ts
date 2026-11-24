import { describe, expect, it } from 'vitest'
import { VOLLEYBALL_CONFIG } from '@/game/ball/volleyballConfig'
import { VOLLEYBALL_SIMULATION_CONFIG } from '@/game/ball/volleyballSimulationConfig'
import { TIP_PHYSICS_CONFIG } from '@/game/contact/tipPhysicsConfig'
import { INDOOR_COURT } from '@/game/court/indoorCourtDimensions'
import { INDOOR_NET, INDOOR_NET_HEIGHTS } from '@/game/net/indoorNetDimensions'

describe('approved TIP physical contract', () => {
  it('keeps every F3.5B coefficient and policy exactly as approved', () => {
    expect(TIP_PHYSICS_CONFIG).toEqual({
      minTargetDepth: 0.80,
      nominalTargetDepth: 1.90,
      maxTargetDepth: 3.00,
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
    })
  })

  it('uses the unchanged ball, gravity, net, court and fixed-step contracts', () => {
    expect(VOLLEYBALL_CONFIG.radius).toBe(0.105)
    expect(VOLLEYBALL_SIMULATION_CONFIG).toEqual({
      gravity: 9.81, fixedStepSeconds: 1 / 60, maxFrameDeltaSeconds: 0.1, maxSubSteps: 8,
    })
    expect(INDOOR_NET_HEIGHTS.men).toBe(2.43)
    expect(INDOOR_NET.bandDepth).toBe(0.025)
    expect(INDOOR_NET.antennaDiameter).toBe(0.01)
    expect(INDOOR_NET.z).toBe(0)
    expect(INDOOR_COURT.halfWidth).toBe(4.5)
    expect(INDOOR_COURT.halfLength).toBe(9)
    expect(INDOOR_COURT.attackLineDistance).toBe(3)
  })
})
