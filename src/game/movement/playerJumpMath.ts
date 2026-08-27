import { PLAYER_JUMP_CONFIG } from '@/game/movement/playerJumpConfig'

export interface VerticalMovementState {
  y: number
  verticalVelocity: number
  grounded: boolean
}

export function getJumpInitialVelocity(
  gravity = PLAYER_JUMP_CONFIG.gravity,
  jumpHeight = PLAYER_JUMP_CONFIG.jumpHeight,
): number {
  return Math.sqrt(2 * gravity * jumpHeight)
}

export function getNextVerticalState(
  state: VerticalMovementState,
  deltaSeconds: number,
  gravity = PLAYER_JUMP_CONFIG.gravity,
  groundY = PLAYER_JUMP_CONFIG.groundY,
): VerticalMovementState {
  if (state.grounded || deltaSeconds <= 0) {
    return state
  }

  const nextY =
    state.y +
    state.verticalVelocity * deltaSeconds -
    0.5 * gravity * deltaSeconds ** 2
  const nextVelocity = state.verticalVelocity - gravity * deltaSeconds

  if (nextY <= groundY) {
    return {
      y: groundY,
      verticalVelocity: 0,
      grounded: true,
    }
  }

  return {
    y: nextY,
    verticalVelocity: nextVelocity,
    grounded: false,
  }
}
