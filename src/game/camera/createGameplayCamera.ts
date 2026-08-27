import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import type { Scene } from '@babylonjs/core/scene'
import { GAMEPLAY_CAMERA_CONFIG } from '@/game/camera/gameplayCameraConfig'
import type { TeamSide } from '@/game/team/teamTypes'

export function createGameplayCamera(
  scene: Scene,
  teamSide: TeamSide,
  name: string,
): FreeCamera {
  const positionZ =
    teamSide === 'A'
      ? -GAMEPLAY_CAMERA_CONFIG.distanceFromCentre
      : GAMEPLAY_CAMERA_CONFIG.distanceFromCentre

  const camera = new FreeCamera(
    name,
    new Vector3(
      GAMEPLAY_CAMERA_CONFIG.x,
      GAMEPLAY_CAMERA_CONFIG.height,
      positionZ,
    ),
    scene,
  )

  camera.setTarget(
    new Vector3(
      GAMEPLAY_CAMERA_CONFIG.target.x,
      GAMEPLAY_CAMERA_CONFIG.target.y,
      GAMEPLAY_CAMERA_CONFIG.target.z,
    ),
  )
  camera.fov = GAMEPLAY_CAMERA_CONFIG.fov
  camera.minZ = GAMEPLAY_CAMERA_CONFIG.minZ
  camera.maxZ = GAMEPLAY_CAMERA_CONFIG.maxZ

  return camera
}
