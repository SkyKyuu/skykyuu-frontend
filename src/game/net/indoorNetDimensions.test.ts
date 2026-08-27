import { describe, expect, it } from 'vitest'
import { INDOOR_COURT } from '@/game/court/indoorCourtDimensions'
import {
  getIndoorNetVerticalLayout,
  INDOOR_NET,
  INDOOR_NET_HEIGHTS,
} from '@/game/net/indoorNetDimensions'

describe('indoor net dimensions', () => {
  it('uses regulation net, post, and antenna measurements in metres', () => {
    expect(INDOOR_NET_HEIGHTS).toEqual({ men: 2.43, women: 2.24 })
    expect(INDOOR_NET).toMatchObject({
      width: 1,
      length: 9.5,
      halfLength: 4.75,
      meshSpacing: 0.1,
      topBandHeight: 0.07,
      bottomBandHeight: 0.05,
      sideBandWidth: 0.05,
      sideBandHeight: 1,
      antennaLength: 1.8,
      antennaDiameter: 0.01,
      antennaAboveNet: 0.8,
      antennaAttachedLength: 1,
      postHeight: 2.55,
      postOutsideDistance: 1,
      z: 0,
    })
  })

  it('derives side bands and posts from the court width', () => {
    expect(INDOOR_NET.sideBandX).toBe(INDOOR_COURT.halfWidth)
    expect(INDOOR_NET.postX).toBe(5.5)
  })

  it('derives the preview vertical layout from the selected height', () => {
    const layout = getIndoorNetVerticalLayout(INDOOR_NET_HEIGHTS.men)

    expect(layout.netTopHeight).toBe(2.43)
    expect(layout.netBottomHeight).toBeCloseTo(1.43)
    expect(layout.netCenterHeight).toBeCloseTo(1.93)
    expect(layout.antennaBottomHeight).toBeCloseTo(1.43)
    expect(layout.antennaTopHeight).toBeCloseTo(3.23)
    expect(layout.antennaCenterHeight).toBeCloseTo(2.33)
  })
})
