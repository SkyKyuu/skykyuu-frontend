import type { SpikeActionType } from '@/game/actions/playerActionTypes'
import type { LocalPlayerInputSnapshot } from '@/game/input/inputTypes'
import type { TeamSide } from '@/game/team/teamTypes'

export interface SpikeIntent {
  readonly actionType: SpikeActionType
  readonly playerId: string
  readonly teamSide: TeamSide
  readonly spikePressed: boolean
  readonly aimLateral: number
  readonly aimForward: number
}

export function createSpikeIntent(snapshot: Readonly<LocalPlayerInputSnapshot>): SpikeIntent {
  const aim = snapshot.spikePressAim ?? snapshot.localMove
  return Object.freeze({
    actionType: 'SPIKE',
    playerId: snapshot.playerId,
    teamSide: snapshot.teamSide,
    spikePressed: snapshot.spikePressed === true,
    aimLateral: aim.lateral,
    aimForward: aim.forward,
  })
}
