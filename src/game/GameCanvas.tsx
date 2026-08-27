import { Engine } from '@babylonjs/core/Engines/engine'
import { useEffect, useRef } from 'react'
import { createGameScene } from '@/game/createGameScene'

function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    const engine = new Engine(canvas, true)
    const scene = createGameScene(engine)
    const renderScene = () => {
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
      scene.dispose()
      engine.dispose()
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="block h-full w-full touch-none outline-none"
      role="img"
      aria-label="SkyKyuu 3D scene"
    />
  )
}

export default GameCanvas
