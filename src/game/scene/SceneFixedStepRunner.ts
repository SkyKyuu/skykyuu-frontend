import { createFrameActionIntents } from '@/game/actions/actionIntegrationBridge'
import type { PlayerCommandIntent } from '@/game/actions/playerActionResolver'
import type { BallSimulationEvent } from '@/game/ball/ballGroundContact'
import { FixedStepVolleyballSimulator, type ActionStepObservation } from '@/game/ball/FixedStepVolleyballSimulator'
import { createPreviewVolleyballState } from '@/game/ball/previewVolleyballState'
import { VOLLEYBALL_SIMULATION_CONFIG } from '@/game/ball/volleyballSimulationConfig'
import type { BallVector3, VolleyballState } from '@/game/ball/volleyballState'
import { validatePlayerHitAimForward, validatePlayerHitAimLateral } from '@/game/contact/playerHitAim'
import type { LocalPlayerInputSnapshot, WorldMoveInput } from '@/game/input/inputTypes'
import { PlayerMovementController, type PlayerMovementTarget } from '@/game/movement/PlayerMovementController'
import type { TeamSide } from '@/game/team/teamTypes'

const STEP_EPSILON_SECONDS = 1e-12
const NEUTRAL_MOVE: Readonly<WorldMoveInput> = Object.freeze({ worldX: 0, worldZ: 0 })

export interface ScenePlayerContactPose {
  readonly playerId: string
  readonly teamSide: TeamSide
  readonly position: Readonly<BallVector3>
  readonly grounded: boolean
  readonly verticalVelocity: number
}

export interface SceneTickResult {
  readonly sceneTick: number
  readonly rallyStep: number
  readonly rallyReset: boolean
  readonly contactPoses: readonly ScenePlayerContactPose[]
  readonly ballState: VolleyballState
  readonly events: readonly BallSimulationEvent[]
  readonly actionStep: ActionStepObservation
}

export interface SceneFrameResult {
  readonly ticks: readonly SceneTickResult[]
  readonly playerPoses: readonly ScenePlayerContactPose[]
  readonly ballState: VolleyballState
}

interface QueuedInput {
  readonly playerId: string
  readonly movement: WorldMoveInput | null
  readonly jumpPressed: boolean
  readonly actions: readonly PlayerCommandIntent[]
}

/** Owns scene time. The movement and ball simulators receive exactly one fixed delta per tick. */
export class SceneFixedStepRunner {
  private readonly players: readonly PlayerMovementTarget[]
  private readonly movement: PlayerMovementController
  private readonly ball: FixedStepVolleyballSimulator
  private readonly createBallState: () => VolleyballState
  private readonly inputQueue = new Map<number, QueuedInput[]>()
  private readonly heldMovement = new Map<string, WorldMoveInput>()
  private nextSceneTick = 0
  private accumulatedSeconds = 0
  private resetBallOnNextTick = false
  private playerPoses: readonly ScenePlayerContactPose[]

  constructor(
    players: readonly PlayerMovementTarget[],
    createBallState: () => VolleyballState = createPreviewVolleyballState,
  ) {
    this.createBallState = createBallState
    this.players = players.map((player) => ({ ...player, position: { ...player.position } }))
    this.movement = new PlayerMovementController(this.players)
    this.ball = new FixedStepVolleyballSimulator(this.createBallState())
    this.playerPoses = this.snapshotContactPoses()
  }

  /** Next unexecuted tick, including across rallies. */
  get sceneTick(): number {
    return this.nextSceneTick
  }

  get rallyStep(): number {
    return this.ball.totalSimulationSteps
  }

  get accumulatorSeconds(): number {
    return this.accumulatedSeconds
  }

  /** Live samples target the next tick. Replays may schedule samples for future ticks. */
  queueInput(snapshots: readonly LocalPlayerInputSnapshot[], tick = this.sceneTick): void {
    if (!Number.isSafeInteger(tick) || tick < this.sceneTick) {
      throw new RangeError('Scene input must target an unexecuted tick')
    }

    if (snapshots.length === 0) return

    const entries = snapshots.map((snapshot): QueuedInput => {
      if (!snapshot.deviceConnected) {
        return { playerId: snapshot.playerId, movement: null, jumpPressed: false, actions: [] }
      }

      const actions = createFrameActionIntents([snapshot])
      for (const action of actions) {
        validatePlayerHitAimLateral(action.aimLateral)
        validatePlayerHitAimForward(action.aimForward)
      }
      return {
        playerId: snapshot.playerId,
        movement: { ...snapshot.worldMove },
        jumpPressed: snapshot.jumpPressed,
        actions,
      }
    })
    const queue = this.inputQueue.get(tick) ?? []
    queue.push(...entries)
    this.inputQueue.set(tick, queue)
  }

  /** Clears both unprocessed edges and action captures for devices that have lost input. */
  clearInput(playerIds = this.players.map(({ playerId }) => playerId)): void {
    const cleared = new Set(playerIds)
    for (const [tick, queue] of this.inputQueue) {
      const remaining = queue.filter(({ playerId }) => !cleared.has(playerId))
      if (remaining.length === 0) this.inputQueue.delete(tick)
      else this.inputQueue.set(tick, remaining)
    }
    for (const playerId of cleared) {
      this.heldMovement.delete(playerId)
      this.ball.clearPlayerActions(playerId)
    }
  }

  advanceFrame(frameDeltaSeconds: number): SceneFrameResult {
    const { fixedStepSeconds, maxFrameDeltaSeconds, maxSubSteps } = VOLLEYBALL_SIMULATION_CONFIG
    const ticks: SceneTickResult[] = []
    if (Number.isFinite(frameDeltaSeconds) && frameDeltaSeconds > 0) {
      this.accumulatedSeconds += Math.min(frameDeltaSeconds, maxFrameDeltaSeconds)
      while (
        this.accumulatedSeconds + STEP_EPSILON_SECONDS >= fixedStepSeconds &&
        ticks.length < maxSubSteps
      ) {
        ticks.push(this.advanceTick(fixedStepSeconds))
        this.accumulatedSeconds -= fixedStepSeconds
      }
      if (Math.abs(this.accumulatedSeconds) < STEP_EPSILON_SECONDS) {
        this.accumulatedSeconds = 0
      }
    }
    return {
      ticks,
      playerPoses: this.playerPoses,
      ballState: ticks.at(-1)?.ballState ?? this.ball.getState(),
    }
  }

  private advanceTick(fixedStepSeconds: number): SceneTickResult {
    const rallyReset = this.resetBallOnNextTick
    if (rallyReset) this.ball.reset(this.createBallState())
    const rallyStep = this.rallyStep

    const jumpEdges = new Set<string>()
    let actions: PlayerCommandIntent[] = []
    for (const input of this.inputQueue.get(this.sceneTick) ?? []) {
      const { playerId, movement, jumpPressed } = input
      if (movement === null) {
        this.heldMovement.delete(playerId)
        this.ball.clearPlayerActions(playerId)
        jumpEdges.delete(playerId)
        actions = actions.filter((action) => action.playerId !== playerId)
        continue
      }
      this.heldMovement.set(playerId, movement)
      if (jumpPressed) jumpEdges.add(playerId)
      actions.push(...input.actions)
    }
    this.inputQueue.delete(this.sceneTick)

    this.movement.update(this.players.map(({ playerId }) => ({
      playerId,
      worldMove: this.heldMovement.get(playerId) ?? NEUTRAL_MOVE,
      jumpPressed: jumpEdges.has(playerId),
    })), fixedStepSeconds)
    this.playerPoses = this.snapshotContactPoses()

    const advance = this.ball.advanceWithActions(fixedStepSeconds, this.playerPoses, actions)
    if (
      advance.executedSteps !== 1 || this.ball.accumulatorSeconds !== 0 ||
      advance.lastActionStep.simulationStep !== rallyStep || this.rallyStep !== rallyStep + 1
    ) {
      throw new Error('Ball must advance exactly one substep on the scene tick')
    }
    this.resetBallOnNextTick = advance.events.some(({ type }) => type === 'GROUND_CONTACT')

    const result: SceneTickResult = {
      sceneTick: this.sceneTick,
      rallyStep,
      rallyReset,
      contactPoses: this.playerPoses,
      ballState: this.ball.getState(),
      events: advance.events,
      actionStep: advance.lastActionStep,
    }
    this.nextSceneTick += 1
    return result
  }

  private snapshotContactPoses(): readonly ScenePlayerContactPose[] {
    return Object.freeze(this.players.map(({ playerId, teamSide, position }) => {
      const state = this.movement.getPlayerState(playerId)
      if (!state) throw new Error(`Missing movement state for player ${playerId}`)
      return Object.freeze({
        playerId,
        teamSide,
        position: Object.freeze({ ...position }),
        ...state,
      })
    }))
  }
}
