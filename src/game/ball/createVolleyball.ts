import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import type { Scene } from '@babylonjs/core/scene'
import type { BallVector3 } from '@/game/ball/volleyballState'
import { VOLLEYBALL_CONFIG } from '@/game/ball/volleyballConfig'

interface CreateVolleyballOptions {
  position: BallVector3
}

export function createVolleyball(
  scene: Scene,
  { position }: CreateVolleyballOptions,
): TransformNode {
  const ballRoot = new TransformNode('volleyball-root', scene)
  ballRoot.position.set(position.x, position.y, position.z)

  const material = new StandardMaterial('volleyball-material', scene)
  material.diffuseColor = new Color3(0.96, 0.82, 0.12)
  material.emissiveColor = new Color3(0.08, 0.06, 0.01)
  material.specularColor = new Color3(0.15, 0.15, 0.15)

  const sphere = CreateSphere(
    'volleyball',
    {
      diameter: VOLLEYBALL_CONFIG.diameter,
      segments: 24,
    },
    scene,
  )
  sphere.position.set(0, 0, 0)
  sphere.material = material
  sphere.parent = ballRoot

  return ballRoot
}
