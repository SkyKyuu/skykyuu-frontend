import { validatePlayerHitAimLateral } from '@/game/contact/playerHitAim'

export function getPlayerHitTimingEffectiveAimLateral(
  hitAimLateral: number,
  hitTimingAccuracyMultiplier: number,
): number {
  const validHitAimLateral = validatePlayerHitAimLateral(hitAimLateral)

  if (
    !Number.isFinite(hitTimingAccuracyMultiplier) ||
    hitTimingAccuracyMultiplier <= 0 ||
    hitTimingAccuracyMultiplier > 1
  ) {
    throw new RangeError(
      `Player hit timing accuracy multiplier must be finite, greater than 0, and at most 1: ${hitTimingAccuracyMultiplier}`,
    )
  }

  return validHitAimLateral * hitTimingAccuracyMultiplier
}
