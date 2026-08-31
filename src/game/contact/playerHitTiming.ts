export interface PlayerHitTimingSample {
  offsetSteps: number
  offsetSeconds: number
}

export function createPlayerHitTimingSample(
  pressStep: number,
  contactEntryStep: number,
  fixedStepSeconds: number,
): PlayerHitTimingSample {
  const offsetSteps = pressStep - contactEntryStep

  return {
    offsetSteps,
    offsetSeconds: offsetSteps * fixedStepSeconds,
  }
}
