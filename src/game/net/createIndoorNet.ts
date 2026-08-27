import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder'
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder'
import { CreateLineSystem } from '@babylonjs/core/Meshes/Builders/linesBuilder'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import type { Scene } from '@babylonjs/core/scene'
import {
  getIndoorNetVerticalLayout,
  INDOOR_NET,
} from '@/game/net/indoorNetDimensions'

const NET_VISUALS = {
  bandDepth: 0.025,
  postDiameter: 0.08,
  antennaStripeDiameter: INDOOR_NET.antennaDiameter * 1.15,
} as const

interface CreateIndoorNetOptions {
  height: number
}

export function createIndoorNet(
  scene: Scene,
  { height }: CreateIndoorNetOptions,
): TransformNode {
  const netRoot = new TransformNode('indoor-net', scene)
  const verticalLayout = getIndoorNetVerticalLayout(height)

  const bandMaterial = new StandardMaterial('indoor-net-band-material', scene)
  bandMaterial.diffuseColor = new Color3(0.95, 0.96, 0.98)
  bandMaterial.specularColor = new Color3(0, 0, 0)

  const postMaterial = new StandardMaterial('indoor-net-post-material', scene)
  postMaterial.diffuseColor = new Color3(0.24, 0.29, 0.35)
  postMaterial.specularColor = new Color3(0, 0, 0)

  const antennaMaterial = new StandardMaterial(
    'indoor-net-antenna-material',
    scene,
  )
  antennaMaterial.diffuseColor = new Color3(0.78, 0.08, 0.08)
  antennaMaterial.specularColor = new Color3(0, 0, 0)

  const meshLines: Vector3[][] = []
  const verticalSections = Math.round(
    INDOOR_NET.length / INDOOR_NET.meshSpacing,
  )
  const horizontalSections = Math.round(
    INDOOR_NET.width / INDOOR_NET.meshSpacing,
  )

  for (let section = 0; section <= verticalSections; section += 1) {
    const x = -INDOOR_NET.halfLength + section * INDOOR_NET.meshSpacing
    meshLines.push([
      new Vector3(x, verticalLayout.netBottomHeight, INDOOR_NET.z),
      new Vector3(x, verticalLayout.netTopHeight, INDOOR_NET.z),
    ])
  }

  for (let section = 0; section <= horizontalSections; section += 1) {
    const y =
      verticalLayout.netBottomHeight + section * INDOOR_NET.meshSpacing
    meshLines.push([
      new Vector3(-INDOOR_NET.halfLength, y, INDOOR_NET.z),
      new Vector3(INDOOR_NET.halfLength, y, INDOOR_NET.z),
    ])
  }

  const netMesh = CreateLineSystem('indoor-net-mesh', { lines: meshLines }, scene)
  netMesh.color = new Color3(0.72, 0.76, 0.82)
  netMesh.alpha = 0.85
  netMesh.parent = netRoot

  const createBand = (
    name: string,
    width: number,
    bandHeight: number,
    x: number,
    y: number,
  ) => {
    const band = CreateBox(
      name,
      { width, height: bandHeight, depth: NET_VISUALS.bandDepth },
      scene,
    )
    band.position.set(x, y, INDOOR_NET.z)
    band.material = bandMaterial
    band.parent = netRoot
  }

  createBand(
    'indoor-net-top-band',
    INDOOR_NET.length,
    INDOOR_NET.topBandHeight,
    0,
    verticalLayout.netTopHeight - INDOOR_NET.topBandHeight / 2,
  )
  createBand(
    'indoor-net-bottom-band',
    INDOOR_NET.length,
    INDOOR_NET.bottomBandHeight,
    0,
    verticalLayout.netBottomHeight + INDOOR_NET.bottomBandHeight / 2,
  )
  createBand(
    'indoor-net-side-band-left',
    INDOOR_NET.sideBandWidth,
    INDOOR_NET.sideBandHeight,
    -INDOOR_NET.sideBandX,
    verticalLayout.netCenterHeight,
  )
  createBand(
    'indoor-net-side-band-right',
    INDOOR_NET.sideBandWidth,
    INDOOR_NET.sideBandHeight,
    INDOOR_NET.sideBandX,
    verticalLayout.netCenterHeight,
  )

  const createPost = (name: string, x: number) => {
    const post = CreateCylinder(
      name,
      {
        height: INDOOR_NET.postHeight,
        diameter: NET_VISUALS.postDiameter,
        tessellation: 24,
      },
      scene,
    )
    post.position.set(x, INDOOR_NET.postHeight / 2, INDOOR_NET.z)
    post.material = postMaterial
    post.parent = netRoot
  }

  createPost('indoor-net-post-left', -INDOOR_NET.postX)
  createPost('indoor-net-post-right', INDOOR_NET.postX)

  const cables = CreateLineSystem(
    'indoor-net-cables',
    {
      lines: [
        [
          new Vector3(
            -INDOOR_NET.halfLength,
            verticalLayout.netTopHeight,
            INDOOR_NET.z,
          ),
          new Vector3(-INDOOR_NET.postX, INDOOR_NET.postHeight, INDOOR_NET.z),
        ],
        [
          new Vector3(
            INDOOR_NET.halfLength,
            verticalLayout.netTopHeight,
            INDOOR_NET.z,
          ),
          new Vector3(INDOOR_NET.postX, INDOOR_NET.postHeight, INDOOR_NET.z),
        ],
        [
          new Vector3(
            -INDOOR_NET.halfLength,
            verticalLayout.netBottomHeight,
            INDOOR_NET.z,
          ),
          new Vector3(
            -INDOOR_NET.postX,
            verticalLayout.netBottomHeight,
            INDOOR_NET.z,
          ),
        ],
        [
          new Vector3(
            INDOOR_NET.halfLength,
            verticalLayout.netBottomHeight,
            INDOOR_NET.z,
          ),
          new Vector3(
            INDOOR_NET.postX,
            verticalLayout.netBottomHeight,
            INDOOR_NET.z,
          ),
        ],
      ],
    },
    scene,
  )
  cables.color = new Color3(0.58, 0.62, 0.68)
  cables.parent = netRoot

  const createAntenna = (side: 'left' | 'right', x: number) => {
    const antenna = CreateCylinder(
      `indoor-net-antenna-${side}`,
      {
        height: INDOOR_NET.antennaLength,
        diameter: INDOOR_NET.antennaDiameter,
        tessellation: 12,
      },
      scene,
    )
    antenna.position.set(
      x,
      verticalLayout.antennaCenterHeight,
      INDOOR_NET.z,
    )
    antenna.material = antennaMaterial
    antenna.parent = netRoot

    for (let stripe = 0; stripe < 4; stripe += 1) {
      const whiteStripe = CreateCylinder(
        `indoor-net-antenna-${side}-white-stripe-${stripe + 1}`,
        {
          height: INDOOR_NET.meshSpacing,
          diameter: NET_VISUALS.antennaStripeDiameter,
          tessellation: 12,
        },
        scene,
      )
      whiteStripe.position.set(
        x,
        verticalLayout.netTopHeight +
          INDOOR_NET.meshSpacing * (stripe * 2 + 1.5),
        INDOOR_NET.z,
      )
      whiteStripe.material = bandMaterial
      whiteStripe.parent = netRoot
    }
  }

  createAntenna('left', -INDOOR_NET.sideBandX)
  createAntenna('right', INDOOR_NET.sideBandX)

  return netRoot
}
