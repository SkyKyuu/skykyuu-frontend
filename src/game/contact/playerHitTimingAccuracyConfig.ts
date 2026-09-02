import type { PlayerHitTimingGrade } from '@/game/contact/playerHitTimingGrade'

// Initial gameplay tuning; F2.15 applies it only to lateral aim fidelity.
export const PLAYER_HIT_TIMING_ACCURACY_CONFIG = {
  VERY_EARLY: 0.6,
  EARLY: 0.85,
  PERFECT: 1,
  LATE: 0.85,
  VERY_LATE: 0.6,
} as const satisfies Record<PlayerHitTimingGrade, number>
