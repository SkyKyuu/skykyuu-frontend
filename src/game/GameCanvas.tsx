import { Engine } from '@babylonjs/core/Engines/engine'
import { useEffect, useRef, useState } from 'react'
import { createGameScene } from '@/game/createGameScene'
import { InputDebugOverlay } from '@/game/input/InputDebugOverlay'
import { LOCAL_INPUT_CONFIG } from '@/game/input/inputConfig'
import { LocalInputManager } from '@/game/input/LocalInputManager'
import type { LocalPlayerInputSnapshot } from '@/game/input/inputTypes'
import { createPreviewInputBindings } from '@/game/input/previewInputBindings'
import { INDOOR_PLAYER_SPAWNS } from '@/game/player/indoorPlayerSpawns'

const PREVIEW_INPUT_BINDINGS = createPreviewInputBindings(INDOOR_PLAYER_SPAWNS)

function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [debugSnapshots, setDebugSnapshots] = useState<
    readonly LocalPlayerInputSnapshot[]
  >([])

  useEffect(() => {
    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    const engine = new Engine(canvas, true)
    const scene = createGameScene(engine)
    const inputManager = new LocalInputManager(PREVIEW_INPUT_BINDINGS)
    let lastDebugUpdate = -Infinity

    inputManager.start()
    const renderScene = () => {
      inputManager.update()

      if (
        import.meta.env.DEV &&
        performance.now() - lastDebugUpdate >=
          LOCAL_INPUT_CONFIG.debugUpdateIntervalMs
      ) {
        setDebugSnapshots(inputManager.getSnapshots())
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
