export type TeamSide = 'A' | 'B'

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
