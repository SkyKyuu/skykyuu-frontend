import { Viewport } from '@babylonjs/core/Maths/math.viewport'
import type { Scene } from '@babylonjs/core/scene'
import { createGameplayCamera } from '@/game/camera/createGameplayCamera'
import type { LocalCameraPlayer } from '@/game/camera/gameplayCameraTypes'
import { getSplitScreenLayout } from '@/game/camera/getSplitScreenLayout'

export function configureGameplayCameras(
  scene: Scene,
  players: readonly LocalCameraPlayer[],
) {
  const layout = getSplitScreenLayout(players.length)
  const cameras = players.map((player, index) => {
    const camera = createGameplayCamera(
      scene,
      player.teamSide,
      `gameplay-camera-${player.localPlayerId}`,
    )
    const viewport = layout[index]

    camera.viewport = new Viewport(
      viewport.x,
      viewport.y,
      viewport.width,
      viewport.height,
    )

    return camera
  })

  scene.activeCamera = cameras[0]
  scene.activeCameras = cameras.length > 1 ? cameras : null

  return cameras
}
