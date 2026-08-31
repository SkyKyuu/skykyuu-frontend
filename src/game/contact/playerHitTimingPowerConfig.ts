import type { PlayerHitTimingGrade } from '@/game/contact/playerHitTimingGrade'

export const PLAYER_HIT_TIMING_POWER_CONFIG = {
  VERY_EARLY: 0.75,
  EARLY: 0.9,
  PERFECT: 1,
  LATE: 0.9,
  VERY_LATE: 0.75,
} as const satisfies Record<PlayerHitTimingGrade, number>
