import { describe, expect, it } from 'vitest'

import {
  acquireComputerControl,
  createComputerControlState,
  takeComputerControlAsHuman,
  toComputerControlPublicState,
  toComputerControlPublicTransition
} from './computer-control-ownership'

describe('renderer-safe computer control state', () => {
  it('reports automation ownership without exposing the agent id', () => {
    const acquired = acquireComputerControl(createComputerControlState(), {
      kind: 'agent',
      id: 'secret-internal-agent-id'
    })

    expect(toComputerControlPublicState(acquired.nextState)).toEqual({
      version: 1,
      epoch: 1,
      owner: 'automation'
    })
    expect(JSON.stringify(toComputerControlPublicState(acquired.nextState))).not.toContain(
      'secret-internal-agent-id'
    )
  })

  it('reports human ownership without exposing the renderer identity', () => {
    const takeover = takeComputerControlAsHuman(createComputerControlState(), {
      kind: 'human',
      id: 'renderer:412'
    })

    expect(toComputerControlPublicTransition(takeover)).toEqual({
      allowed: true,
      changed: true,
      reason: 'human-takeover',
      state: {
        version: 1,
        epoch: 1,
        owner: 'human'
      }
    })
    expect(JSON.stringify(toComputerControlPublicTransition(takeover))).not.toContain('renderer:412')
  })

  it('keeps the unowned state explicit', () => {
    expect(toComputerControlPublicState(createComputerControlState())).toEqual({
      version: 1,
      epoch: 0,
      owner: null
    })
  })
})
