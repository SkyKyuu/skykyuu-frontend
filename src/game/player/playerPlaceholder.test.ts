import { describe, expect, it } from 'vitest'
import { INDOOR_COURT } from '@/game/court/indoorCourtDimensions'
import {
  getTeamFacingRotationY,
  INDOOR_PLAYER_SPAWNS,
} from '@/game/player/indoorPlayerSpawns'
import { PLACEHOLDER_PLAYER } from '@/game/player/playerDimensions'

describe('placeholder player configuration', () => {
  it('uses the default human-scale dimensions in metres', () => {
    expect(PLACEHOLDER_PLAYER.height).toBe(1.8)
    expect(PLACEHOLDER_PLAYER.radius).toBe(0.28)
  })

  it('places the body centre above the feet-based root', () => {
    expect(PLACEHOLDER_PLAYER.bodyCenterY).toBe(
      PLACEHOLDER_PLAYER.height / 2,
    )
  })

  it('derives the TEAM_A spawn from the indoor court length', () => {
    expect(INDOOR_PLAYER_SPAWNS[0]).toEqual({
      playerId: 'player-1',
      teamSide: 'A',
      position: {
        x: 0,
        y: 0,
        z: -INDOOR_COURT.halfLength / 2,
      },
    })
  })

  it('derives the TEAM_B spawn from the indoor court length', () => {
    expect(INDOOR_PLAYER_SPAWNS[1]).toEqual({
      playerId: 'player-2',
      teamSide: 'B',
      position: {
        x: 0,
        y: 0,
        z: INDOOR_COURT.halfLength / 2,
      },
    })
  })

  it('orients both teams toward the centre net', () => {
    expect(getTeamFacingRotationY('A')).toBe(0)
    expect(getTeamFacingRotationY('B')).toBe(Math.PI)
  })
})
