import {
  validatePlayerHitAimLateral,
  validatePlayerHitAimForward,
} from '@/game/contact/playerHitAim'
import { PLAYER_HIT_AIM_PHYSICS_CONFIG } from '@/game/contact/playerHitAimPhysicsConfig'
import type { TeamSide } from '@/game/team/teamTypes'

export function playerHitAimLateralToWorldX(
  teamSide: TeamSide,
  aimLateral: number,
): number {
  return playerLocalAimToWorldAxis(teamSide, validatePlayerHitAimLateral(aimLateral))
}

export function playerHitAimForwardToWorldZ(
  teamSide: TeamSide,
  aimForward: number,
): number {
  return playerLocalAimToWorldAxis(teamSide, validatePlayerHitAimForward(aimForward))
}

function playerLocalAimToWorldAxis(teamSide: TeamSide, validAim: number): number {
  if (validAim === 0) {
    return 0
  }

  return teamSide === 'A' ? validAim : -validAim
}

export function getPlayerHitAimVelocityX(
  teamSide: TeamSide,
  aimLateral: number,
): number {
  return (
    playerHitAimLateralToWorldX(teamSide, aimLateral) *
    PLAYER_HIT_AIM_PHYSICS_CONFIG.maxLateralVelocityContribution
  )
}
