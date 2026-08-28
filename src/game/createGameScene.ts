import type { Engine } from '@babylonjs/core/Engines/engine'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight'
import { Color4 } from '@babylonjs/core/Maths/math.color'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { Scene } from '@babylonjs/core/scene'
import { createVolleyball } from '@/game/ball/createVolleyball'
import { INDOOR_BALL_SPAWN } from '@/game/ball/indoorBallSpawn'
import { createInitialVolleyballState } from '@/game/ball/volleyballState'
import { configureGameplayCameras } from '@/game/camera/configureGameplayCameras'
import { createIndoorCourt } from '@/game/court/createIndoorCourt'
import { createIndoorNet } from '@/game/net/createIndoorNet'
import { INDOOR_NET_HEIGHTS } from '@/game/net/indoorNetDimensions'
import { createPlaceholderPlayer } from '@/game/player/createPlaceholderPlayer'
import { INDOOR_PLAYER_SPAWNS } from '@/game/player/indoorPlayerSpawns'

const PREVIEW_LOCAL_PLAYERS = INDOOR_PLAYER_SPAWNS.map(
  ({ playerId, teamSide }) => ({ localPlayerId: playerId, teamSide }),
)

export interface GameSceneResult {
  scene: Scene
  playerRoots: ReadonlyMap<string, TransformNode>
  ballRoot: TransformNode
}

export function createGameScene(engine: Engine): GameSceneResult {
  const scene = new Scene(engine)
  const playerRoots = new Map<string, TransformNode>()
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
    playerRoots.set(player.playerId, createPlaceholderPlayer(scene, player))
  })
  const initialBallState = createInitialVolleyballState(INDOOR_BALL_SPAWN)
  const ballRoot = createVolleyball(scene, {
    position: initialBallState.position,
  })
  configureGameplayCameras(scene, PREVIEW_LOCAL_PLAYERS)

  return { scene, playerRoots, ballRoot }
}
