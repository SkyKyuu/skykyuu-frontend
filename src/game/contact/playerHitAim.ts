export function validatePlayerHitAimLateral(value: number): number {
  if (!Number.isFinite(value) || value < -1 || value > 1) {
    throw new RangeError(
      `Player hit aim lateral must be finite and between -1 and 1: ${value}`,
    )
  }

  return value
}
