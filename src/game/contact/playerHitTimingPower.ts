import type { PlayerHitTimingGrade } from '@/game/contact/playerHitTimingGrade'
import { PLAYER_HIT_TIMING_POWER_CONFIG } from '@/game/contact/playerHitTimingPowerConfig'

export function getPlayerHitTimingForwardMultiplier(
  grade: PlayerHitTimingGrade,
): number {
  return PLAYER_HIT_TIMING_POWER_CONFIG[grade]
}
