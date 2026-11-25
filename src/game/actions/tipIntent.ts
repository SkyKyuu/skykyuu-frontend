import type { TipActionType } from '@/game/actions/playerActionTypes'
import type { LocalPlayerInputSnapshot } from '@/game/input/inputTypes'
import type { TeamSide } from '@/game/team/teamTypes'

/** Captured local aim only; eligibility and trajectory belong to the simulator. */
export interface TipIntent {
  readonly actionType: TipActionType
  readonly playerId: string
  readonly teamSide: TeamSide
  readonly tipPressed: boolean
  readonly aimLateral: number
  readonly aimForward: number
}

export function createTipIntent(snapshot: Readonly<LocalPlayerInputSnapshot>): TipIntent {
  const aim = snapshot.tipPressAim ?? snapshot.localMove
  return Object.freeze({
    actionType: 'TIP',
    playerId: snapshot.playerId,
    teamSide: snapshot.teamSide,
    tipPressed: snapshot.tipPressed === true,
    aimLateral: aim.lateral,
    aimForward: aim.forward,
  })
}
