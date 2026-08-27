import type { Engine } from '@babylonjs/core/Engines/engine'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight'
import { Color4 } from '@babylonjs/core/Maths/math.color'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { Scene } from '@babylonjs/core/scene'
import { configureGameplayCameras } from '@/game/camera/configureGameplayCameras'
import { createIndoorCourt } from '@/game/court/createIndoorCourt'
import { createIndoorNet } from '@/game/net/createIndoorNet'
import { INDOOR_NET_HEIGHTS } from '@/game/net/indoorNetDimensions'
import { createPlaceholderPlayer } from '@/game/player/createPlaceholderPlayer'
import { INDOOR_PLAYER_SPAWNS } from '@/game/player/indoorPlayerSpawns'

const PREVIEW_LOCAL_PLAYERS = INDOOR_PLAYER_SPAWNS.map(
  ({ playerId, teamSide }) => ({ localPlayerId: playerId, teamSide }),
)

export function createGameScene(engine: Engine): Scene {
  const scene = new Scene(engine)
  scene.clearColor = new Color4(0.04, 0.06, 0.1, 1)

  const light = new HemisphericLight(
    'validation-light',
    new Vector3(0, 1, 0),
    scene,
  )
  light.intensity = 0.85

  createIndoorCourt(scene)
  createIndoorNet(scene, { height: INDOOR_NET_HEIGHTS.men })
  INDOOR_PLAYER_SPAWNS.forEach((player) => {
    createPlaceholderPlayer(scene, player)
  })
  configureGameplayCameras(scene, PREVIEW_LOCAL_PLAYERS)

  return scene
}
