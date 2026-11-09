import { Engine } from '@babylonjs/core/Engines/engine'
import { useEffect, useRef, useState } from 'react'
import {
  BallDebugOverlay,
  type BallDebugSnapshot,
} from '@/game/ball/BallDebugOverlay'
import type { BallGroundContactEvent } from '@/game/ball/ballGroundContact'
import type {
  ActionStepObservation,
  ExecutedPlayerAction,
} from '@/game/ball/FixedStepVolleyballSimulator'
import type { PlayerBallContactEvent } from '@/game/contact/playerBallContact'
import type { PlayerBallContactResponseEvent } from '@/game/contact/playerBallContactResponse'
import type { PlayerForearmPassResponseEvent } from '@/game/contact/forearmPassContactResponse'
import type { PlayerSetResponseEvent } from '@/game/contact/setContactResponse'
import { createGameScene } from '@/game/createGameScene'
import {
  InputDebugOverlay,
  type PlayerDebugSnapshot,
} from '@/game/input/InputDebugOverlay'
import { LOCAL_INPUT_CONFIG } from '@/game/input/inputConfig'
import { LocalInputManager } from '@/game/input/LocalInputManager'
import { createPreviewInputBindings } from '@/game/input/previewInputBindings'
import { INDOOR_PLAYER_SPAWNS } from '@/game/player/indoorPlayerSpawns'
import { SceneFixedStepRunner } from '@/game/scene/SceneFixedStepRunner'

const PREVIEW_INPUT_BINDINGS = createPreviewInputBindings(
  INDOOR_PLAYER_SPAWNS,
)

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
    const runner = new SceneFixedStepRunner(INDOOR_PLAYER_SPAWNS)
    const gamepadPlayerIds = PREVIEW_INPUT_BINDINGS
      .filter(({ deviceKind }) => deviceKind === 'gamepad')
      .map(({ playerId }) => playerId)
    let acceptsInput = document.hasFocus()
    let resampleGamepads = false
    let lastActionStep: ActionStepObservation | null = null
    let lastDebugUpdate = -Infinity
    let lastLanding: BallGroundContactEvent | null = null
    let lastPlayerContact: PlayerBallContactEvent | null = null
    let lastContactResponse: PlayerBallContactResponseEvent | null = null
    let lastForearmPassResponse: PlayerForearmPassResponseEvent | null = null
    let lastSetResponse: PlayerSetResponseEvent | null = null
    const lastExecutedActions = new Map<string, ExecutedPlayerAction>()

    inputManager.start()
    const blurInput = () => {
      acceptsInput = false
      runner.clearInput()
      lastActionStep = null
    }
    const focusInput = () => {
      // Sample held buttons before accepting edges again.
      inputManager.update()
      acceptsInput = true
    }
    const disconnectGamepad = () => {
      // Removing a device can change the logical slots of the remaining gamepads.
      runner.clearInput(gamepadPlayerIds)
      resampleGamepads = true
      lastActionStep = null
    }
    const renderScene = () => {
      const snapshots = inputManager.update()
      if (acceptsInput) {
        runner.queueInput(resampleGamepads ? snapshots.map((snapshot) => (
          snapshot.deviceKind === 'gamepad' ? {
            ...snapshot,
            jumpPressed: false,
            hitPressed: false,
            forearmPassPressed: false,
            setPressed: false,
          } : snapshot
        )) : snapshots)
      }
      resampleGamepads = false
      const frame = runner.advanceFrame(engine.getDeltaTime() / 1000)

      for (const tick of frame.ticks) {
        if (tick.rallyReset) {
          lastExecutedActions.clear()
          lastSetResponse = null
          lastDebugUpdate = -Infinity
        }

        lastActionStep = tick.actionStep
        const { executedAction } = tick.actionStep
        if (import.meta.env.DEV && executedAction) {
          lastExecutedActions.set(executedAction.action.playerId, executedAction)
        }

        for (const event of tick.events) {
          if (event.type === 'GROUND_CONTACT') {
            lastLanding = event
          } else if (event.type === 'PLAYER_CONTACT') {
            lastPlayerContact = event
          } else if (event.type === 'PLAYER_CONTACT_RESPONSE') {
            lastContactResponse = event
          } else if (event.type === 'PLAYER_FOREARM_PASS_RESPONSE') {
            lastForearmPassResponse = event
          } else if (event.type === 'PLAYER_SET_RESPONSE') {
            lastSetResponse = event
          }
        }
      }

      for (const { playerId, position } of frame.playerPoses) {
        playerRoots.get(playerId)?.position.set(position.x, position.y, position.z)
      }

      const { ballState } = frame
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
            const pose = frame.playerPoses.find(({ playerId }) => playerId === snapshot.playerId)
            if (!pose) return []

            return [{
              ...snapshot,
              simulationStep: lastActionStep?.simulationStep ?? runner.rallyStep,
              selectedAction: lastActionStep?.selectedActions.find(({ playerId }) => playerId === snapshot.playerId) ?? null,
              lastExecutedAction: lastExecutedActions.get(snapshot.playerId) ?? null,
              position: { ...pose.position },
              grounded: pose.grounded,
              verticalVelocity: pose.verticalVelocity,
            }]
          }),
        )
        setBallDebugSnapshot({
          position: { ...ballState.position },
          velocity: { ...ballState.velocity },
          accumulatorSeconds: runner.accumulatorSeconds,
          totalSimulationSteps: runner.rallyStep,
          sceneTick: runner.sceneTick,
          executedSceneSteps: frame.ticks.length,
          lastLanding,
          lastPlayerContact,
          lastContactResponse,
          lastForearmPassResponse,
          lastSetResponse,
        })
        lastDebugUpdate = performance.now()
      }
    }
    const resizeEngine = () => {
      engine.resize()
    }

    engine.runRenderLoop(renderScene)
    window.addEventListener('resize', resizeEngine)
    window.addEventListener('blur', blurInput)
    window.addEventListener('focus', focusInput)
    window.addEventListener('gamepaddisconnected', disconnectGamepad)

    return () => {
      window.removeEventListener('resize', resizeEngine)
      window.removeEventListener('blur', blurInput)
      window.removeEventListener('focus', focusInput)
      window.removeEventListener('gamepaddisconnected', disconnectGamepad)
      engine.stopRenderLoop(renderScene)
      runner.clearInput()
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
