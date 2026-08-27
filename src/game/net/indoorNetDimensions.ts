import { INDOOR_COURT } from '@/game/court/indoorCourtDimensions'

const netWidth = 1
const netLength = 9.5
const meshSpacing = 0.1
const antennaLength = 1.8
const antennaAboveNet = 0.8
const postOutsideDistance = 1

export const INDOOR_NET_HEIGHTS = {
  men: 2.43,
  women: 2.24,
} as const

export const INDOOR_NET = {
  width: netWidth,
  length: netLength,
  halfLength: netLength / 2,
  meshSpacing,
  topBandHeight: 0.07,
  bottomBandHeight: 0.05,
  sideBandWidth: 0.05,
  sideBandHeight: netWidth,
  sideBandX: INDOOR_COURT.halfWidth,
  antennaLength,
  antennaDiameter: 0.01,
  antennaAboveNet,
  antennaAttachedLength: antennaLength - antennaAboveNet,
  postHeight: 2.55,
  postOutsideDistance,
  postX: INDOOR_COURT.halfWidth + postOutsideDistance,
  z: 0,
} as const

export function getIndoorNetVerticalLayout(height: number) {
  const netBottomHeight = height - INDOOR_NET.width
  const antennaBottomHeight = height - INDOOR_NET.antennaAttachedLength

  return {
    netTopHeight: height,
    netBottomHeight,
    netCenterHeight: netBottomHeight + INDOOR_NET.width / 2,
    antennaBottomHeight,
    antennaTopHeight: height + INDOOR_NET.antennaAboveNet,
    antennaCenterHeight:
      antennaBottomHeight + INDOOR_NET.antennaLength / 2,
  } as const
}
