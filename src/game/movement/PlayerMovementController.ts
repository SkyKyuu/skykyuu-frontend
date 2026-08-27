import type { LocalPlayerInputSnapshot } from '@/game/input/inputTypes'
import { PLAYER_JUMP_CONFIG } from '@/game/movement/playerJumpConfig'
import {
  getJumpInitialVelocity,
  getNextVerticalState,
} from '@/game/movement/playerJumpMath'
import {
  getIndoorMovementBounds,
  getNextHorizontalPosition,
  getSafeDeltaSeconds,
  type IndoorMovementBounds,
} from '@/game/movement/playerMovementMath'
import { PLACEHOLDER_PLAYER } from '@/game/player/playerDimensions'
import type { TeamSide } from '@/game/team/teamTypes'

export interface PlayerMovementTarget {
  playerId: string
  teamSide: TeamSide
  position: {
    x: number
    y: number
    z: number
  }
}

interface RegisteredMovementTarget {
  position: PlayerMovementTarget['position']
  bounds: IndoorMovementBounds
  verticalVelocity: number
  grounded: boolean
}

export interface PlayerMovementState {
  verticalVelocity: number
  grounded: boolean
}

export class PlayerMovementController {
  private readonly targets = new Map<string, RegisteredMovementTarget>()
  private readonly jumpInitialVelocity = getJumpInitialVelocity()

  constructor(
    playerTargets: readonly PlayerMovementTarget[],
    playerRadius = PLACEHOLDER_PLAYER.radius,
  ) {
    for (const target of playerTargets) {
      const grounded = target.position.y <= PLAYER_JUMP_CONFIG.groundY

      if (grounded) {
        target.position.y = PLAYER_JUMP_CONFIG.groundY
      }

      this.targets.set(target.playerId, {
        position: target.position,
        bounds: getIndoorMovementBounds(target.teamSide, playerRadius),
        verticalVelocity: 0,
        grounded,
      })
    }
  }

  update(
    snapshots: readonly LocalPlayerInputSnapshot[],
    deltaSeconds: number,
  ): void {
    const safeDeltaSeconds = getSafeDeltaSeconds(deltaSeconds)

    for (const snapshot of snapshots) {
      const target = this.targets.get(snapshot.playerId)

      if (!target) {
        continue
      }

      if (snapshot.jumpPressed && target.grounded) {
        target.verticalVelocity = this.jumpInitialVelocity
        target.grounded = false
      }

      if (safeDeltaSeconds > 0) {
        const nextPosition = getNextHorizontalPosition(
          target.position,
          snapshot.worldMove,
          safeDeltaSeconds,
          target.bounds,
        )
        const nextVerticalState = getNextVerticalState(
          {
            y: target.position.y,
            verticalVelocity: target.verticalVelocity,
            grounded: target.grounded,
          },
          safeDeltaSeconds,
        )

        target.position.x = nextPosition.x
        target.position.y = nextVerticalState.y
        target.position.z = nextPosition.z
        target.verticalVelocity = nextVerticalState.verticalVelocity
        target.grounded = nextVerticalState.grounded
      }
    }
  }

  getPlayerState(playerId: string): PlayerMovementState | undefined {
    const target = this.targets.get(playerId)

    if (!target) {
      return undefined
    }

    return {
      verticalVelocity: target.verticalVelocity,
      grounded: target.grounded,
    }
  }
}
