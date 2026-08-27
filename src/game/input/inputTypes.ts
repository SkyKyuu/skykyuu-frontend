import type { TeamSide } from '@/game/team/teamTypes'

export interface LocalMoveInput {
  lateral: number
  forward: number
}

export interface WorldMoveInput {
  worldX: number
  worldZ: number
}

export interface KeyboardInputBinding {
  playerId: string
  teamSide: TeamSide
  deviceKind: 'keyboard'
}

export interface GamepadInputBinding {
  playerId: string
  teamSide: TeamSide
  deviceKind: 'gamepad'
  gamepadSlot: number
}

export type LocalInputBinding = KeyboardInputBinding | GamepadInputBinding

export interface InputSourceState {
  connected: boolean
  deviceName: string
  localMove: LocalMoveInput
  jumpHeld: boolean
}

export interface LocalPlayerInputSnapshot {
  playerId: string
  teamSide: TeamSide
  deviceKind: LocalInputBinding['deviceKind']
  deviceName: string
  deviceConnected: boolean
  localMove: LocalMoveInput
  worldMove: WorldMoveInput
  jumpHeld: boolean
  jumpPressed: boolean
}
