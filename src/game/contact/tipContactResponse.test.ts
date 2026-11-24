import { describe, expect, it } from 'vitest'
import type { PlayerBallContactEvent } from '@/game/contact/playerBallContact'
import { solveTipBallisticTrajectory } from '@/game/contact/tipBallisticSolver'
import { createTipContactResponse } from '@/game/contact/tipContactResponse'

function fixture() {
  const contact: PlayerBallContactEvent = {
    type: 'PLAYER_CONTACT', playerId: 'a', teamSide: 'A',
    ballPosition: { x: 0, y: 2.65, z: -0.5 },
    ballVelocity: { x: 100, y: -20, z: -30 },
    playerPosition: { x: 0.25, y: 1, z: -0.5 },
  }
  const trajectory = solveTipBallisticTrajectory(contact.ballPosition, 'A', 0.5, -0.5)
  if (trajectory.status !== 'ADMISSIBLE_TRAJECTORY') throw new Error('Invalid fixture')
  return { contact, trajectory }
}

describe('TIP response telemetry', () => {
  it('uses the exact validated plan, with distinct press, contact and response steps', () => {
    const { contact, trajectory } = fixture()
    const event = createTipContactResponse(contact, 12, 10, 13, 1 / 60, 0.5, -0.5, trajectory)
    expect(event.type).toBe('PLAYER_TIP_RESPONSE')
    expect(event.actionType).toBe('TIP')
    expect(event.playerId).toBe('a')
    expect(event.teamSide).toBe('A')
    expect(event.pressStep).toBe(12)
    expect(event.contactStep).toBe(10)
    expect(event.responseStep).toBe(13)
    expect(event.aimLateral).toBe(0.5)
    expect(event.aimForward).toBe(-0.5)
    expect(event.timingOffsetSteps).toBe(2)
    expect(event.timingOffsetSeconds).toBe(2 / 60)
    expect(event.timingGrade).toBe('LATE')
    expect(event.outgoingVelocity).toEqual(trajectory.outgoingVelocity)
    expect(event.targetPosition).toEqual(trajectory.targetPosition)
    expect(event.admissibleTimeInterval).toEqual(trajectory.admissibleTimeInterval)
    expect(event.flightTimeSeconds).toBe(trajectory.selectedFlightTime)
    expect(event.initialSpeed).toBe(trajectory.initialSpeed)
    expect(event.apexHeight).toBe(trajectory.apexHeight)
    expect(event.netEntryClearance).toBe(trajectory.netEntryClearance)
    expect(event.netExitClearance).toBe(trajectory.netExitClearance)
  })

  it('never applies timing power, aim accuracy or incoming-velocity retention', () => {
    const { contact, trajectory } = fixture()
    const early = createTipContactResponse(contact, 0, 5, 5, 1 / 60, 0.5, -0.5, trajectory)
    const changed = { ...contact, ballVelocity: { x: -900, y: 80, z: 400 } }
    const late = createTipContactResponse(changed, 15, 5, 15, 1 / 60, 0.5, -0.5, trajectory)
    expect(early.timingGrade).not.toBe(late.timingGrade)
    expect(late.incomingVelocity).toEqual(changed.ballVelocity)
    expect(early.outgoingVelocity).toEqual(late.outgoingVelocity)
    expect(early.targetPosition).toEqual(late.targetPosition)
    expect(late.aimLateral).toBe(early.aimLateral)
    expect(late.aimForward).toBe(early.aimForward)
    expect('timingPowerMultiplier' in early).toBe(false)
    expect('timingAccuracyMultiplier' in early).toBe(false)
  })

  it('freezes nested data and detaches the incoming contact snapshot', () => {
    const { contact, trajectory } = fixture()
    const event = createTipContactResponse(contact, 0, 0, 0, 1 / 60, 0.5, -0.5, trajectory)
    contact.ballPosition.x = 99
    contact.ballVelocity.x = 99
    expect(event.ballPosition.x).toBe(0)
    expect(event.incomingVelocity.x).toBe(100)
    for (const value of [event, event.ballPosition, event.incomingVelocity,
      event.outgoingVelocity, event.targetPosition, event.admissibleTimeInterval]) {
      expect(Object.isFrozen(value)).toBe(true)
    }
  })

  it('detaches and freezes nested plan values even for a structurally valid mutable caller', () => {
    const { contact, trajectory } = fixture()
    const mutable = {
      ...trajectory,
      outgoingVelocity: { ...trajectory.outgoingVelocity },
      targetPosition: { ...trajectory.targetPosition },
      admissibleTimeInterval: { ...trajectory.admissibleTimeInterval },
    }
    const event = createTipContactResponse(contact, 0, 0, 0, 1 / 60, 0.5, -0.5, mutable)
    mutable.outgoingVelocity.x = 99
    mutable.targetPosition.x = 99
    mutable.admissibleTimeInterval.min = 99
    expect(event.outgoingVelocity).toEqual(trajectory.outgoingVelocity)
    expect(event.targetPosition).toEqual(trajectory.targetPosition)
    expect(event.admissibleTimeInterval).toEqual(trajectory.admissibleTimeInterval)
    for (const value of [event.outgoingVelocity, event.targetPosition, event.admissibleTimeInterval]) {
      expect(Object.isFrozen(value)).toBe(true)
    }
  })
})
