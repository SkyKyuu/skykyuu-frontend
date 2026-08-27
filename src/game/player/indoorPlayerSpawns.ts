import { INDOOR_COURT } from '@/game/court/indoorCourtDimensions'
import type { TeamSide } from '@/game/team/teamTypes'

export interface PlayerPosition {
  x: number
  y: number
  z: number
}

export interface IndoorPlayerSpawn {
  playerId: string
  teamSide: TeamSide
  position: PlayerPosition
}

export const INDOOR_PLAYER_SPAWNS: readonly IndoorPlayerSpawn[] = [
  {
    playerId: 'player-1',
    teamSide: 'A',
    position: {
      x: 0,
      y: 0,
      z: -INDOOR_COURT.halfLength / 2,
    },
  },
  {
    playerId: 'player-2',
    teamSide: 'B',
    position: {
      x: 0,
      y: 0,
      z: INDOOR_COURT.halfLength / 2,
    },
  },
] as const

export function getTeamFacingRotationY(teamSide: TeamSide): number {
  return teamSide === 'A' ? 0 : Math.PI
}
