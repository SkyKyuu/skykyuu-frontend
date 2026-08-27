import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder'
import { CreateCapsule } from '@babylonjs/core/Meshes/Builders/capsuleBuilder'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import type { Scene } from '@babylonjs/core/scene'
import {
  getTeamFacingRotationY,
  type PlayerPosition,
} from '@/game/player/indoorPlayerSpawns'
import { PLACEHOLDER_PLAYER } from '@/game/player/playerDimensions'
import type { TeamSide } from '@/game/team/teamTypes'

interface CreatePlaceholderPlayerOptions {
  playerId: string
  teamSide: TeamSide
  position: PlayerPosition
}

const TEAM_COLORS: Record<TeamSide, Color3> = {
  A: new Color3(0.12, 0.46, 0.82),
  B: new Color3(0.9, 0.3, 0.12),
}

function getOrCreateMaterial(
  scene: Scene,
  name: string,
  diffuseColor: Color3,
): StandardMaterial {
  const existingMaterial = scene.getMaterialByName(name)

  if (existingMaterial instanceof StandardMaterial) {
    return existingMaterial
  }

  const material = new StandardMaterial(name, scene)
  material.diffuseColor = diffuseColor
  material.specularColor = new Color3(0, 0, 0)

  return material
}

export function createPlaceholderPlayer(
  scene: Scene,
  { playerId, teamSide, position }: CreatePlaceholderPlayerOptions,
): TransformNode {
  const playerRoot = new TransformNode(`player-${playerId}`, scene)
  playerRoot.position.set(position.x, position.y, position.z)
  playerRoot.rotation.y = getTeamFacingRotationY(teamSide)

  const body = CreateCapsule(
    `player-${playerId}-body`,
    {
      height: PLACEHOLDER_PLAYER.height,
      radius: PLACEHOLDER_PLAYER.radius,
      tessellation: 24,
      subdivisions: 2,
      capSubdivisions: 6,
    },
    scene,
  )
  body.position.y = PLACEHOLDER_PLAYER.bodyCenterY
  body.material = getOrCreateMaterial(
    scene,
    `player-team-${teamSide}-material`,
    TEAM_COLORS[teamSide],
  )
  body.parent = playerRoot

  const facingMarker = CreateBox(
    `player-${playerId}-facing-marker`,
    {
      width: PLACEHOLDER_PLAYER.facingMarker.width,
      height: PLACEHOLDER_PLAYER.facingMarker.height,
      depth: PLACEHOLDER_PLAYER.facingMarker.depth,
    },
    scene,
  )
  facingMarker.position.set(
    0,
    PLACEHOLDER_PLAYER.facingMarker.centerY,
    PLACEHOLDER_PLAYER.facingMarker.centerZ,
  )
  facingMarker.material = getOrCreateMaterial(
    scene,
    'player-facing-marker-material',
    new Color3(0.98, 0.9, 0.18),
  )
  facingMarker.parent = playerRoot

  return playerRoot
}
