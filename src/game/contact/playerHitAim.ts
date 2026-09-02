function validatePlayerHitAimAxis(value: number, axis: string): number {
  if (!Number.isFinite(value) || value < -1 || value > 1) {
    throw new RangeError(
      `Player hit aim ${axis} must be finite and between -1 and 1: ${value}`,
    )
  }

  return value
}

export function validatePlayerHitAimLateral(value: number): number {
  return validatePlayerHitAimAxis(value, 'lateral')
}

export function validatePlayerHitAimForward(value: number): number {
  return validatePlayerHitAimAxis(value, 'forward')
}
