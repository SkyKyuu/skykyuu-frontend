import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder'
import type { Scene } from '@babylonjs/core/scene'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { INDOOR_COURT } from '@/game/court/indoorCourtDimensions'

const SURFACE_HEIGHT = {
  freeZone: 0,
  court: 0.002,
  lines: 0.004,
} as const

export function createIndoorCourt(scene: Scene): TransformNode {
  const courtRoot = new TransformNode('indoor-court', scene)

  const freeZoneMaterial = new StandardMaterial(
    'indoor-court-free-zone-material',
    scene,
  )
  freeZoneMaterial.diffuseColor = new Color3(0.16, 0.2, 0.25)
  freeZoneMaterial.specularColor = new Color3(0, 0, 0)

  const courtMaterial = new StandardMaterial(
    'indoor-court-surface-material',
    scene,
  )
  courtMaterial.diffuseColor = new Color3(0.67, 0.34, 0.16)
  courtMaterial.specularColor = new Color3(0, 0, 0)

  const lineMaterial = new StandardMaterial(
    'indoor-court-line-material',
    scene,
  )
  lineMaterial.diffuseColor = new Color3(0.95, 0.96, 0.98)
  lineMaterial.specularColor = new Color3(0, 0, 0)

  const freeZone = CreateGround(
    'indoor-court-free-zone',
    {
      width: INDOOR_COURT.totalAreaWidth,
      height: INDOOR_COURT.totalAreaLength,
    },
    scene,
  )
  freeZone.position.y = SURFACE_HEIGHT.freeZone
  freeZone.material = freeZoneMaterial
  freeZone.parent = courtRoot

  const playingSurface = CreateGround(
    'indoor-court-playing-surface',
    { width: INDOOR_COURT.width, height: INDOOR_COURT.length },
    scene,
  )
  playingSurface.position.y = SURFACE_HEIGHT.court
  playingSurface.material = courtMaterial
  playingSurface.parent = courtRoot

  const createLine = (
    name: string,
    width: number,
    length: number,
    x: number,
    z: number,
  ) => {
    const line = CreateGround(name, { width, height: length }, scene)
    line.position.set(x, SURFACE_HEIGHT.lines, z)
    line.material = lineMaterial
    line.parent = courtRoot
  }

  const boundaryX = INDOOR_COURT.halfWidth - INDOOR_COURT.lineWidth / 2
  const boundaryZ = INDOOR_COURT.halfLength - INDOOR_COURT.lineWidth / 2

  createLine(
    'indoor-court-sideline-left',
    INDOOR_COURT.lineWidth,
    INDOOR_COURT.length,
    -boundaryX,
    0,
  )
  createLine(
    'indoor-court-sideline-right',
    INDOOR_COURT.lineWidth,
    INDOOR_COURT.length,
    boundaryX,
    0,
  )
  createLine(
    'indoor-court-end-line-a',
    INDOOR_COURT.width,
    INDOOR_COURT.lineWidth,
    0,
    -boundaryZ,
  )
  createLine(
    'indoor-court-end-line-b',
    INDOOR_COURT.width,
    INDOOR_COURT.lineWidth,
    0,
    boundaryZ,
  )
  createLine(
    'indoor-court-centre-line',
    INDOOR_COURT.width,
    INDOOR_COURT.lineWidth,
    0,
    0,
  )
  createLine(
    'indoor-court-attack-line-a',
    INDOOR_COURT.width,
    INDOOR_COURT.lineWidth,
    0,
    -INDOOR_COURT.attackLineDistance,
  )
  createLine(
    'indoor-court-attack-line-b',
    INDOOR_COURT.width,
    INDOOR_COURT.lineWidth,
    0,
    INDOOR_COURT.attackLineDistance,
  )

  return courtRoot
}
