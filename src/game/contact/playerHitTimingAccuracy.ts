import type { PlayerHitTimingGrade } from '@/game/contact/playerHitTimingGrade'
import { PLAYER_HIT_TIMING_ACCURACY_CONFIG } from '@/game/contact/playerHitTimingAccuracyConfig'

export function getPlayerHitTimingAccuracyMultiplier(
  grade: PlayerHitTimingGrade,
): number {
  return PLAYER_HIT_TIMING_ACCURACY_CONFIG[grade]
}
