import { beforeEach, describe, expect, it } from 'vitest'

import {
  authorizeAutomatedComputerAction,
  getComputerControlState,
  releaseHumanComputerControl,
  resetComputerControlGateForTest,
  takeHumanComputerControl
} from './computer-control-gate'
import { RuntimeClientError } from './runtime-client-error'

describe('computer control execution gate', () => {
  beforeEach(() => resetComputerControlGateForTest())

  it('lazily grants automation control without changing existing action flow', () => {
    expect(getComputerControlState().owner).toBeNull()

    expect(() => authorizeAutomatedComputerAction()).not.toThrow()
    const state = getComputerControlState()
    expect(state.owner).toEqual({
      kind: 'agent',
      id: 'code-fusion-computer-automation'
    })

    expect(() => authorizeAutomatedComputerAction()).not.toThrow()
    expect(getComputerControlState().epoch).toBe(state.epoch)
  })

  it('blocks automation while a human owns control', () => {
    authorizeAutomatedComputerAction()
    const takeover = takeHumanComputerControl('local-human')

    expect(takeover).toMatchObject({ allowed: true, changed: true, reason: 'human-takeover' })
    expect(() => authorizeAutomatedComputerAction()).toThrowError(
      expect.objectContaining<Partial<RuntimeClientError>>({
        code: 'computer_control_owned_by_human'
      })
    )
  })

  it('uses the ownership epoch to reject stale release attempts', () => {
    authorizeAutomatedComputerAction()
    const staleEpoch = getComputerControlState().epoch
    takeHumanComputerControl('local-human')

    expect(releaseHumanComputerControl('local-human', staleEpoch)).toMatchObject({
      allowed: false,
      changed: false,
      reason: 'stale-epoch'
    })
    expect(getComputerControlState().owner?.kind).toBe('human')
  })

  it('requires the owning human to release control', () => {
    authorizeAutomatedComputerAction()
    takeHumanComputerControl('local-human')
    const epoch = getComputerControlState().epoch

    expect(releaseHumanComputerControl('other-human', epoch)).toMatchObject({
      allowed: false,
      reason: 'not-owner'
    })
    expect(releaseHumanComputerControl('local-human', epoch)).toMatchObject({
      allowed: true,
      changed: true,
      reason: 'released'
    })
    expect(getComputerControlState().owner).toBeNull()
  })

  it('lets automation resume after the human releases control', () => {
    authorizeAutomatedComputerAction()
    takeHumanComputerControl('local-human')
    const epoch = getComputerControlState().epoch
    releaseHumanComputerControl('local-human', epoch)

    expect(() => authorizeAutomatedComputerAction()).not.toThrow()
    expect(getComputerControlState().owner?.kind).toBe('agent')
  })

  it('rejects malformed human identities without disturbing automation', () => {
    authorizeAutomatedComputerAction()

    expect(takeHumanComputerControl('   ')).toMatchObject({
      allowed: false,
      reason: 'invalid-human'
    })
    expect(getComputerControlState().owner?.kind).toBe('agent')
  })
})
