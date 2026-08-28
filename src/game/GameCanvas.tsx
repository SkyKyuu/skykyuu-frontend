import { Engine } from '@babylonjs/core/Engines/engine'
import { useEffect, useRef, useState } from 'react'
import {
  BallDebugOverlay,
  type BallDebugSnapshot,
} from '@/game/ball/BallDebugOverlay'
import type { BallGroundContactEvent } from '@/game/ball/ballGroundContact'
import { FixedStepVolleyballSimulator } from '@/game/ball/FixedStepVolleyballSimulator'
import { createPreviewVolleyballState } from '@/game/ball/previewVolleyballState'
import type {
  PlayerBallContactEvent,
  PlayerBallContactTarget,
} from '@/game/contact/playerBallContact'
import type { PlayerBallContactResponseEvent } from '@/game/contact/playerBallContactResponse'
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
  const [ballDebugSnapshot, setBallDebugSnapshot] =
    useState<BallDebugSnapshot | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    const engine = new Engine(canvas, true)
    const { scene, playerRoots, ballRoot } = createGameScene(engine)
    const inputManager = new LocalInputManager(PREVIEW_INPUT_BINDINGS)
    const ballSimulator = new FixedStepVolleyballSimulator(
      createPreviewVolleyballState(),
    )
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
    let lastLanding: BallGroundContactEvent | null = null
    let lastPlayerContact: PlayerBallContactEvent | null = null
    let lastContactResponse: PlayerBallContactResponseEvent | null = null
    let resetPreviewOnNextFrame = false

    inputManager.start()
    const renderScene = () => {
      if (resetPreviewOnNextFrame) {
        ballSimulator.reset(createPreviewVolleyballState())
        resetPreviewOnNextFrame = false
      }

      const snapshots = inputManager.update()
      const frameDeltaSeconds = engine.getDeltaTime() / 1000

      movementController.update(snapshots, frameDeltaSeconds)
      const playerContactTargets: PlayerBallContactTarget[] =
        movementTargets.map(({ playerId, teamSide, position }) => ({
          playerId,
          teamSide,
          position: {
            x: position.x,
            y: position.y,
            z: position.z,
          },
        }))
      const advanceResult = ballSimulator.advance(
        frameDeltaSeconds,
        playerContactTargets,
      )

      for (const event of advanceResult.events) {
        if (event.type === 'GROUND_CONTACT') {
          lastLanding = event
          resetPreviewOnNextFrame = true
        } else if (event.type === 'PLAYER_CONTACT') {
          lastPlayerContact = event
        } else if (event.type === 'PLAYER_CONTACT_RESPONSE') {
          lastContactResponse = event
        }
      }

      const ballState = ballSimulator.getState()

      ballRoot.position.set(
        ballState.position.x,
        ballState.position.y,
        ballState.position.z,
      )
      scene.render()

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
        setBallDebugSnapshot({
          position: { ...ballState.position },
          velocity: { ...ballState.velocity },
          accumulatorSeconds: ballSimulator.accumulatorSeconds,
          totalSimulationSteps: ballSimulator.totalSimulationSteps,
          lastLanding,
          lastPlayerContact,
          lastContactResponse,
        })
        lastDebugUpdate = performance.now()
      }
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
      <BallDebugOverlay snapshot={ballDebugSnapshot} />
    </>
  )
}

export default GameCanvas
