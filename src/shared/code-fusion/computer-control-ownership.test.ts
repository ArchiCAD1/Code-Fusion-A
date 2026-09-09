import { describe, expect, it } from 'vitest'

import {
  acquireComputerControl,
  createComputerControlState,
  evaluateComputerActionControl,
  handoffComputerControl,
  releaseComputerControl,
  takeComputerControlAsHuman
} from './computer-control-ownership'

const agentA = { kind: 'agent' as const, id: 'agent-a' }
const agentB = { kind: 'agent' as const, id: 'agent-b' }
const humanA = { kind: 'human' as const, id: 'human-a' }
const humanB = { kind: 'human' as const, id: 'human-b' }

describe('computer control ownership', () => {
  it('allows exactly one owner to act', () => {
    const initial = createComputerControlState()
    expect(evaluateComputerActionControl(initial, agentA)).toEqual({
      allowed: false,
      reason: 'unowned'
    })

    const acquired = acquireComputerControl(initial, agentA)
    expect(acquired).toMatchObject({ allowed: true, changed: true, reason: 'acquired' })
    expect(evaluateComputerActionControl(acquired.nextState, agentA)).toEqual({
      allowed: true,
      reason: 'owner'
    })
    expect(evaluateComputerActionControl(acquired.nextState, agentB)).toEqual({
      allowed: false,
      reason: 'owned-by-other'
    })
  })

  it('makes reacquisition by the same owner idempotent', () => {
    const acquired = acquireComputerControl(createComputerControlState(), agentA)
    const repeated = acquireComputerControl(acquired.nextState, agentA)

    expect(repeated).toEqual({
      allowed: true,
      changed: false,
      reason: 'already-owner',
      nextState: acquired.nextState
    })
  })

  it('lets a human take control from an agent and blocks the agent while the human owns it', () => {
    const acquired = acquireComputerControl(createComputerControlState(), agentA)
    const takeover = takeComputerControlAsHuman(acquired.nextState, humanA)

    expect(takeover).toMatchObject({ allowed: true, changed: true, reason: 'human-takeover' })
    expect(takeover.nextState.epoch).toBe(acquired.nextState.epoch + 1)
    expect(evaluateComputerActionControl(takeover.nextState, agentA)).toEqual({
      allowed: false,
      reason: 'owned-by-other'
    })
    expect(evaluateComputerActionControl(takeover.nextState, humanA)).toEqual({
      allowed: true,
      reason: 'owner'
    })
  })

  it('does not allow one human to silently preempt another human', () => {
    const first = takeComputerControlAsHuman(createComputerControlState(), humanA)
    const second = takeComputerControlAsHuman(first.nextState, humanB)

    expect(second).toEqual({
      allowed: false,
      changed: false,
      reason: 'human-owner-protected',
      nextState: first.nextState
    })
  })

  it('requires an explicit handoff before an agent regains control', () => {
    const acquired = acquireComputerControl(createComputerControlState(), agentA)
    const takeover = takeComputerControlAsHuman(acquired.nextState, humanA)

    expect(acquireComputerControl(takeover.nextState, agentA)).toMatchObject({
      allowed: false,
      reason: 'owned-by-other'
    })

    const handoff = handoffComputerControl(
      takeover.nextState,
      humanA,
      agentA,
      takeover.nextState.epoch
    )
    expect(handoff).toMatchObject({ allowed: true, changed: true, reason: 'handoff' })
    expect(evaluateComputerActionControl(handoff.nextState, agentA).allowed).toBe(true)
  })

  it('rejects stale or non-owner release requests', () => {
    const acquired = acquireComputerControl(createComputerControlState(), agentA)
    const takeover = takeComputerControlAsHuman(acquired.nextState, humanA)

    expect(releaseComputerControl(takeover.nextState, agentA, acquired.nextState.epoch)).toMatchObject({
      allowed: false,
      reason: 'stale-epoch'
    })
    expect(releaseComputerControl(takeover.nextState, agentB, takeover.nextState.epoch)).toMatchObject({
      allowed: false,
      reason: 'not-owner'
    })
  })

  it('releases only for the current owner at the current epoch', () => {
    const acquired = acquireComputerControl(createComputerControlState(), agentA)
    const released = releaseComputerControl(acquired.nextState, agentA, acquired.nextState.epoch)

    expect(released).toMatchObject({ allowed: true, changed: true, reason: 'released' })
    expect(released.nextState.owner).toBeNull()
    expect(released.nextState.epoch).toBe(acquired.nextState.epoch + 1)
  })

  it('rejects malformed actor identities', () => {
    expect(takeComputerControlAsHuman(createComputerControlState(), { kind: 'human', id: '   ' })).toMatchObject({
      allowed: false,
      reason: 'invalid-human'
    })
    expect(
      evaluateComputerActionControl(createComputerControlState(), {
        kind: 'agent',
        id: 'bad\nactor'
      })
    ).toEqual({ allowed: false, reason: 'invalid-actor' })
  })
})