import {
  validatePlayerHitAimLateral,
  validatePlayerHitAimForward,
} from '@/game/contact/playerHitAim'

export function getPlayerHitTimingEffectiveAimLateral(
  hitAimLateral: number,
  hitTimingAccuracyMultiplier: number,
): number {
  return applyTimingAccuracy(
    validatePlayerHitAimLateral(hitAimLateral),
    hitTimingAccuracyMultiplier,
  )
}

export function getPlayerHitTimingEffectiveAimForward(
  hitAimForward: number,
  hitTimingAccuracyMultiplier: number,
): number {
  return applyTimingAccuracy(
    validatePlayerHitAimForward(hitAimForward),
    hitTimingAccuracyMultiplier,
  )
}

function applyTimingAccuracy(
  validHitAim: number,
  hitTimingAccuracyMultiplier: number,
): number {
  if (
    !Number.isFinite(hitTimingAccuracyMultiplier) ||
    hitTimingAccuracyMultiplier <= 0 ||
    hitTimingAccuracyMultiplier > 1
  ) {
    throw new RangeError(
      `Player hit timing accuracy multiplier must be finite, greater than 0, and at most 1: ${hitTimingAccuracyMultiplier}`,
    )
  }

  return validHitAim * hitTimingAccuracyMultiplier
}
