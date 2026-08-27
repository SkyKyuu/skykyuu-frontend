import type { LocalPlayerInputSnapshot } from '@/game/input/inputTypes'

interface InputDebugOverlayProps {
  snapshots: readonly PlayerDebugSnapshot[]
}

export interface PlayerDebugSnapshot extends LocalPlayerInputSnapshot {
  position: {
    x: number
    z: number
  }
}

function formatValue(value: number): string {
  return Math.abs(value) < 0.005 ? '0.00' : value.toFixed(2)
}

function formatDevice(snapshot: LocalPlayerInputSnapshot): string {
  if (snapshot.deviceKind === 'keyboard') {
    return 'Keyboard'
  }

  return snapshot.deviceConnected ? 'Gamepad · Connected' : 'Gamepad · Disconnected'
}

export function InputDebugOverlay({ snapshots }: InputDebugOverlayProps) {
  if (!import.meta.env.DEV) {
    return null
  }

  return (
    <aside
      aria-label="Local input debug"
      className="pointer-events-none absolute left-3 top-3 z-10 flex max-h-[calc(100vh-1.5rem)] w-64 flex-col gap-2 overflow-hidden rounded-lg border border-slate-600/70 bg-slate-950/85 p-3 font-mono text-xs text-slate-100 shadow-xl backdrop-blur-sm"
    >
      <div className="text-sm font-semibold tracking-wide text-cyan-300">
        Local Input
      </div>
      {snapshots.map((snapshot, index) => (
        <section
          key={snapshot.playerId}
          aria-label={`P${index + 1} input`}
          className="border-t border-slate-700 pt-2 first:border-0 first:pt-0"
        >
          <div className="font-semibold text-white">
            P{index + 1} · TEAM_{snapshot.teamSide}
          </div>
          <dl className="mt-1 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5">
            <dt>Device</dt>
            <dd>{formatDevice(snapshot)}</dd>
            <dt>Local X</dt>
            <dd>{formatValue(snapshot.localMove.lateral)}</dd>
            <dt>Local Forward</dt>
            <dd>{formatValue(snapshot.localMove.forward)}</dd>
            <dt>World X</dt>
            <dd>{formatValue(snapshot.worldMove.worldX)}</dd>
            <dt>World Z</dt>
            <dd>{formatValue(snapshot.worldMove.worldZ)}</dd>
            <dt>Position X</dt>
            <dd>{formatValue(snapshot.position.x)}</dd>
            <dt>Position Z</dt>
            <dd>{formatValue(snapshot.position.z)}</dd>
            <dt>Jump Held</dt>
            <dd>{snapshot.jumpHeld ? 'true' : 'false'}</dd>
          </dl>
        </section>
      ))}
    </aside>
  )
}
