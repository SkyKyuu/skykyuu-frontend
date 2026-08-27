import { Engine } from '@babylonjs/core/Engines/engine'
import { useEffect, useRef, useState } from 'react'
import { createGameScene } from '@/game/createGameScene'
import {
  InputDebugOverlay,
  type PlayerDebugSnapshot,
} from '@/game/input/InputDebugOverlay'
import { LOCAL_INPUT_CONFIG } from '@/game/input/inputConfig'
import { LocalInputManager } from '@/game/input/LocalInputManager'
import { createPreviewInputBindings } from '@/game/input/previewInputBindings'
import {
  PlayerMovementController,
  type PlayerMovementTarget,
} from '@/game/movement/PlayerMovementController'
import { INDOOR_PLAYER_SPAWNS } from '@/game/player/indoorPlayerSpawns'

const PREVIEW_INPUT_BINDINGS = createPreviewInputBindings(INDOOR_PLAYER_SPAWNS)

function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [debugSnapshots, setDebugSnapshots] = useState<readonly PlayerDebugSnapshot[]>(
    [],
  )

  useEffect(() => {
    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    const engine = new Engine(canvas, true)
    const { scene, playerRoots } = createGameScene(engine)
    const inputManager = new LocalInputManager(PREVIEW_INPUT_BINDINGS)
    const movementTargets: PlayerMovementTarget[] = INDOOR_PLAYER_SPAWNS.map(
      ({ playerId, teamSide }) => {
        const playerRoot = playerRoots.get(playerId)

        if (!playerRoot) {
          throw new Error(`Missing movement root for ${playerId}`)
        }

        return { playerId, teamSide, position: playerRoot.position }
      },
    )
    const movementController = new PlayerMovementController(movementTargets)
    let lastDebugUpdate = -Infinity

    inputManager.start()
    const renderScene = () => {
      const snapshots = inputManager.update()
      const deltaSeconds = engine.getDeltaTime() / 1000

      movementController.update(snapshots, deltaSeconds)

      if (
        import.meta.env.DEV &&
        performance.now() - lastDebugUpdate >=
          LOCAL_INPUT_CONFIG.debugUpdateIntervalMs
      ) {
        setDebugSnapshots(
          snapshots.flatMap((snapshot) => {
            const playerRoot = playerRoots.get(snapshot.playerId)
            const movementState = movementController.getPlayerState(
              snapshot.playerId,
            )

            return playerRoot && movementState
              ? [
                  {
                    ...snapshot,
                    position: {
                      x: playerRoot.position.x,
                      y: playerRoot.position.y,
                      z: playerRoot.position.z,
                    },
                    grounded: movementState.grounded,
                    verticalVelocity: movementState.verticalVelocity,
                  },
                ]
              : []
          }),
        )
        lastDebugUpdate = performance.now()
      }

      scene.render()
    }
    const resizeEngine = () => {
      engine.resize()
    }

    engine.runRenderLoop(renderScene)
    window.addEventListener('resize', resizeEngine)

    return () => {
      window.removeEventListener('resize', resizeEngine)
      engine.stopRenderLoop(renderScene)
      inputManager.dispose()
      scene.dispose()
      engine.dispose()
    }
  }, [])

  return (
    <>
      <canvas
        ref={canvasRef}
        className="block h-full w-full touch-none outline-none"
        role="img"
        aria-label="SkyKyuu 3D scene"
      />
      <InputDebugOverlay snapshots={debugSnapshots} />
    </>
  )
}

export default GameCanvas
