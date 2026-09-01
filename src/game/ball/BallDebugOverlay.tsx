import type { BallVector3 } from '@/game/ball/volleyballState'
import type { BallGroundContactEvent } from '@/game/ball/ballGroundContact'
import { VOLLEYBALL_SIMULATION_CONFIG } from '@/game/ball/volleyballSimulationConfig'
import type { PlayerBallContactEvent } from '@/game/contact/playerBallContact'
import type { PlayerBallContactResponseEvent } from '@/game/contact/playerBallContactResponse'

interface BallDebugOverlayProps {
  snapshot: BallDebugSnapshot | null
}

export interface BallDebugSnapshot {
  position: BallVector3
  velocity: BallVector3
  accumulatorSeconds: number
  totalSimulationSteps: number
  lastLanding: BallGroundContactEvent | null
  lastPlayerContact: PlayerBallContactEvent | null
  lastContactResponse: PlayerBallContactResponseEvent | null
}

function formatValue(value: number): string {
  return Math.abs(value) < 0.0005 ? '0.000' : value.toFixed(3)
}

function formatSignedValue(value: number, fractionDigits: number): string {
  const formatted = value.toFixed(fractionDigits)

  return value > 0 ? `+${formatted}` : formatted
}

export function BallDebugOverlay({ snapshot }: BallDebugOverlayProps) {
  if (!import.meta.env.DEV || !snapshot) {
    return null
  }

  const fixedHz = 1 / VOLLEYBALL_SIMULATION_CONFIG.fixedStepSeconds

  return (
    <aside
      aria-label="Volleyball simulation debug"
      className="pointer-events-none absolute right-3 top-3 z-10 w-64 rounded-lg border border-slate-600/70 bg-slate-950/85 p-3 font-mono text-xs text-slate-100 shadow-xl backdrop-blur-sm"
    >
      <div className="text-sm font-semibold tracking-wide text-amber-300">
        Volleyball Simulation
      </div>
      <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 border-t border-slate-700 pt-2">
        <dt>Ball Position X</dt>
        <dd>{formatValue(snapshot.position.x)}</dd>
        <dt>Ball Position Y</dt>
        <dd>{formatValue(snapshot.position.y)}</dd>
        <dt>Ball Position Z</dt>
        <dd>{formatValue(snapshot.position.z)}</dd>
        <dt>Velocity X</dt>
        <dd>{formatValue(snapshot.velocity.x)}</dd>
        <dt>Velocity Y</dt>
        <dd>{formatValue(snapshot.velocity.y)}</dd>
        <dt>Velocity Z</dt>
        <dd>{formatValue(snapshot.velocity.z)}</dd>
        <dt>Accumulator</dt>
        <dd>{formatValue(snapshot.accumulatorSeconds)}</dd>
        <dt>Simulation Steps</dt>
        <dd>{snapshot.totalSimulationSteps}</dd>
        <dt>Fixed Hz</dt>
        <dd>{fixedHz.toFixed(0)}</dd>
      </dl>
      {snapshot.lastLanding ? (
        <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 border-t border-slate-700 pt-2">
          <dt className="col-span-2 font-semibold text-amber-300">Last Landing</dt>
          <dt>Result</dt>
          <dd>{snapshot.lastLanding.courtResult}</dd>
          <dt>Side</dt>
          <dd>{snapshot.lastLanding.courtSide}</dd>
          <dt>X</dt>
          <dd>{formatValue(snapshot.lastLanding.position.x)}</dd>
          <dt>Z</dt>
          <dd>{formatValue(snapshot.lastLanding.position.z)}</dd>
          <dt>Impact Vy</dt>
          <dd>{formatValue(snapshot.lastLanding.velocity.y)}</dd>
        </dl>
      ) : null}
      {snapshot.lastPlayerContact ? (
        <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 border-t border-slate-700 pt-2">
          <dt className="col-span-2 font-semibold text-cyan-300">
            Last Player Contact
          </dt>
          <dt>Player ID</dt>
          <dd>{snapshot.lastPlayerContact.playerId}</dd>
          <dt>Team</dt>
          <dd>{snapshot.lastPlayerContact.teamSide}</dd>
          <dt>Ball X</dt>
          <dd>{formatValue(snapshot.lastPlayerContact.ballPosition.x)}</dd>
          <dt>Ball Y</dt>
          <dd>{formatValue(snapshot.lastPlayerContact.ballPosition.y)}</dd>
          <dt>Ball Z</dt>
          <dd>{formatValue(snapshot.lastPlayerContact.ballPosition.z)}</dd>
          <dt>Ball Vy</dt>
          <dd>{formatValue(snapshot.lastPlayerContact.ballVelocity.y)}</dd>
        </dl>
      ) : null}
      {snapshot.lastContactResponse ? (
        <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 border-t border-slate-700 pt-2">
          <dt className="col-span-2 font-semibold text-emerald-300">
            Last Contact Response
          </dt>
          <dt>Player ID</dt>
          <dd>{snapshot.lastContactResponse.playerId}</dd>
          <dt>Team</dt>
          <dd>{snapshot.lastContactResponse.teamSide}</dd>
          <dt>Hit Offset Steps</dt>
          <dd>
            {formatSignedValue(
              snapshot.lastContactResponse.hitTimingOffsetSteps,
              0,
            )}
          </dd>
          <dt>Hit Offset ms</dt>
          <dd>
            {formatSignedValue(
              snapshot.lastContactResponse.hitTimingOffsetSeconds * 1_000,
              3,
            )}
          </dd>
          <dt>Hit Timing</dt>
          <dd>{snapshot.lastContactResponse.hitTimingGrade}</dd>
          <dt>Timing Forward x</dt>
          <dd>
            {formatValue(
              snapshot.lastContactResponse.hitTimingForwardMultiplier,
            )}
          </dd>
          <dt>Hit Aim Lateral</dt>
          <dd>
            {formatSignedValue(
              snapshot.lastContactResponse.hitAimLateral,
              3,
            )}
          </dd>
          <dt>Incoming Vx</dt>
          <dd>{formatValue(snapshot.lastContactResponse.incomingVelocity.x)}</dd>
          <dt>Incoming Vy</dt>
          <dd>{formatValue(snapshot.lastContactResponse.incomingVelocity.y)}</dd>
          <dt>Incoming Vz</dt>
          <dd>{formatValue(snapshot.lastContactResponse.incomingVelocity.z)}</dd>
          <dt>Outgoing Vx</dt>
          <dd>{formatValue(snapshot.lastContactResponse.outgoingVelocity.x)}</dd>
          <dt>Outgoing Vy</dt>
          <dd>{formatValue(snapshot.lastContactResponse.outgoingVelocity.y)}</dd>
          <dt>Outgoing Vz</dt>
          <dd>{formatValue(snapshot.lastContactResponse.outgoingVelocity.z)}</dd>
        </dl>
      ) : null}
    </aside>
  )
}
