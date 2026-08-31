import { PLAYER_HIT_TIMING_GRADE_CONFIG } from '@/game/contact/playerHitTimingGradeConfig'

export type PlayerHitTimingGrade =
  | 'VERY_EARLY'
  | 'EARLY'
  | 'PERFECT'
  | 'LATE'
  | 'VERY_LATE'

export function classifyPlayerHitTiming(
  offsetSteps: number,
): PlayerHitTimingGrade {
  if (!Number.isInteger(offsetSteps)) {
    throw new RangeError(
      `Player hit timing offset must be an integer: ${offsetSteps}`,
    )
  }

  const config = PLAYER_HIT_TIMING_GRADE_CONFIG

  if (offsetSteps <= config.veryEarlyMaxOffsetSteps) {
    return 'VERY_EARLY'
  }

  if (offsetSteps <= config.earlyMaxOffsetSteps) {
    return 'EARLY'
  }

  if (offsetSteps === config.perfectOffsetSteps) {
    return 'PERFECT'
  }

  if (offsetSteps <= config.lateMaxOffsetSteps) {
    return 'LATE'
  }

  return 'VERY_LATE'
}
