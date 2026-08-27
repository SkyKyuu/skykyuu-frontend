import type { LocalMoveInput, WorldMoveInput } from '@/game/input/inputTypes'
import type { TeamSide } from '@/game/team/teamTypes'

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

export function normalizeMove2D(move: LocalMoveInput): LocalMoveInput {
  const lateral = clamp(move.lateral, -1, 1)
  const forward = clamp(move.forward, -1, 1)
  const magnitude = Math.hypot(lateral, forward)

  if (magnitude <= 1) {
    return { lateral, forward }
  }

  return {
    lateral: lateral / magnitude,
    forward: forward / magnitude,
  }
}

export function applyRadialDeadzone(
  move: LocalMoveInput,
  deadzone: number,
): LocalMoveInput {
  const safeDeadzone = clamp(deadzone, 0, 0.99)
  const magnitude = Math.hypot(move.lateral, move.forward)

  if (magnitude <= safeDeadzone || magnitude === 0) {
    return { lateral: 0, forward: 0 }
  }

  const scaledMagnitude = clamp(
    (magnitude - safeDeadzone) / (1 - safeDeadzone),
    0,
    1,
  )

  return {
    lateral: (move.lateral / magnitude) * scaledMagnitude,
    forward: (move.forward / magnitude) * scaledMagnitude,
  }
}

export function localMoveToWorld(
  teamSide: TeamSide,
  localMove: LocalMoveInput,
): WorldMoveInput {
  const direction = teamSide === 'A' ? 1 : -1
  const worldX = localMove.lateral * direction
  const worldZ = localMove.forward * direction

  return {
    worldX: worldX === 0 ? 0 : worldX,
    worldZ: worldZ === 0 ? 0 : worldZ,
  }
}
