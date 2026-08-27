import type { SplitScreenViewport } from '@/game/camera/gameplayCameraTypes'

const FULL_VIEWPORT: SplitScreenViewport = {
  x: 0,
  y: 0,
  width: 1,
  height: 1,
}

const TOP_LEFT: SplitScreenViewport = {
  x: 0,
  y: 0.5,
  width: 0.5,
  height: 0.5,
}

const TOP_RIGHT: SplitScreenViewport = {
  x: 0.5,
  y: 0.5,
  width: 0.5,
  height: 0.5,
}

const BOTTOM_LEFT: SplitScreenViewport = {
  x: 0,
  y: 0,
  width: 0.5,
  height: 0.5,
}

const BOTTOM_RIGHT: SplitScreenViewport = {
  x: 0.5,
  y: 0,
  width: 0.5,
  height: 0.5,
}

const TOP_HALF: SplitScreenViewport = {
  x: 0,
  y: 0.5,
  width: 1,
  height: 0.5,
}

const BOTTOM_HALF: SplitScreenViewport = {
  x: 0,
  y: 0,
  width: 1,
  height: 0.5,
}

function copyViewport(
  viewport: SplitScreenViewport,
): SplitScreenViewport {
  return { ...viewport }
}

export function getSplitScreenLayout(
  playerCount: number,
): SplitScreenViewport[] {
  if (!Number.isInteger(playerCount) || playerCount < 1 || playerCount > 4) {
    throw new RangeError('Local player count must be an integer from 1 to 4')
  }

  if (playerCount === 1) {
    return [copyViewport(FULL_VIEWPORT)]
  }

  if (playerCount === 2) {
    return [TOP_HALF, BOTTOM_HALF].map(copyViewport)
  }

  const grid = [TOP_LEFT, TOP_RIGHT, BOTTOM_LEFT, BOTTOM_RIGHT]

  return grid.slice(0, playerCount).map(copyViewport)
}
