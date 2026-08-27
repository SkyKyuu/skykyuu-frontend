import type { TeamSide } from '@/game/team/teamTypes'

export type { TeamSide } from '@/game/team/teamTypes'

export interface LocalCameraPlayer {
  localPlayerId: string
  teamSide: TeamSide
}

export interface SplitScreenViewport {
  x: number
  y: number
  width: number
  height: number
}
