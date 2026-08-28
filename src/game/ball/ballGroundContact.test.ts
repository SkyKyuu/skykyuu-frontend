import { describe, expect, it } from 'vitest'
import {
  classifyIndoorCourtResult,
  classifyIndoorCourtSide,
  createBallGroundContactEvent,
} from '@/game/ball/ballGroundContact'
import { INDOOR_COURT } from '@/game/court/indoorCourtDimensions'

describe('indoor landing classification', () => {
  it('classifies the centre of the court as IN', () => {
    expect(classifyIndoorCourtResult({ x: 0, y: 0.105, z: 0 })).toBe('IN')
  })

  it.each([
    { x: INDOOR_COURT.halfWidth, y: 0.105, z: 0 },
    { x: -INDOOR_COURT.halfWidth, y: 0.105, z: 0 },
    { x: 0, y: 0.105, z: INDOOR_COURT.halfLength },
    { x: 0, y: 0.105, z: -INDOOR_COURT.halfLength },
  ])('treats a boundary contact as IN (%o)', (position) => {
    expect(classifyIndoorCourtResult(position)).toBe('IN')
  })

  it.each([
    { x: INDOOR_COURT.halfWidth + 0.001, y: 0.105, z: 0 },
    { x: -INDOOR_COURT.halfWidth - 0.001, y: 0.105, z: 0 },
    { x: 0, y: 0.105, z: INDOOR_COURT.halfLength + 0.001 },
    { x: 0, y: 0.105, z: -INDOOR_COURT.halfLength - 0.001 },
  ])('classifies a position beyond the court as OUT (%o)', (position) => {
    expect(classifyIndoorCourtResult(position)).toBe('OUT')
  })

  it.each([
    [{ x: 0, y: 0.105, z: -0.001 }, 'A'],
    [{ x: 0, y: 0.105, z: 0.001 }, 'B'],
    [{ x: 0, y: 0.105, z: 0 }, 'CENTER'],
  ] as const)('classifies court side %o as %s', (position, expectedSide) => {
    expect(classifyIndoorCourtSide(position)).toBe(expectedSide)
  })

  it('creates an immutable, fully classified landing event', () => {
    const position = { x: 0, y: 0.105, z: 1 }
    const velocity = { x: 2, y: -3, z: 4 }
    const event = createBallGroundContactEvent(position, velocity)

    position.z = 99
    velocity.y = 99

    expect(event).toEqual({
      type: 'GROUND_CONTACT',
      position: { x: 0, y: 0.105, z: 1 },
      velocity: { x: 2, y: -3, z: 4 },
      courtResult: 'IN',
      courtSide: 'B',
    })
  })
})
