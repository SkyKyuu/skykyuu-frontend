import { validatePlayerHitAimLateral } from '@/game/contact/playerHitAim'
import { PLAYER_HIT_AIM_PHYSICS_CONFIG } from '@/game/contact/playerHitAimPhysicsConfig'
import type { TeamSide } from '@/game/team/teamTypes'

export function playerHitAimLateralToWorldX(
  teamSide: TeamSide,
  aimLateral: number,
): number {
  const validAimLateral = validatePlayerHitAimLateral(aimLateral)

  if (validAimLateral === 0) {
    return 0
  }

  return teamSide === 'A' ? validAimLateral : -validAimLateral
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
