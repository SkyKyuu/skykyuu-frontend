import type { LocalPlayerInputSnapshot } from '@/game/input/inputTypes'
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
}

export class PlayerMovementController {
  private readonly targets = new Map<string, RegisteredMovementTarget>()

  constructor(
    playerTargets: readonly PlayerMovementTarget[],
    playerRadius = PLACEHOLDER_PLAYER.radius,
  ) {
    for (const target of playerTargets) {
      this.targets.set(target.playerId, {
        position: target.position,
        bounds: getIndoorMovementBounds(target.teamSide, playerRadius),
      })
    }
  }

  update(
    snapshots: readonly LocalPlayerInputSnapshot[],
    deltaSeconds: number,
  ): void {
    const safeDeltaSeconds = getSafeDeltaSeconds(deltaSeconds)

    if (safeDeltaSeconds === 0) {
      return
    }

    for (const snapshot of snapshots) {
      const target = this.targets.get(snapshot.playerId)

      if (!target) {
        continue
      }

      const nextPosition = getNextHorizontalPosition(
        target.position,
        snapshot.worldMove,
        safeDeltaSeconds,
        target.bounds,
      )

      target.position.x = nextPosition.x
      target.position.z = nextPosition.z
    }
  }
}
