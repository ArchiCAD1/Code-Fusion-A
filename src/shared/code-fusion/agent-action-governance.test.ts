import { describe, expect, it } from 'vitest'

import {
  AGENT_ACTION_GOVERNANCE_VERSION,
  isAgentActionEffect,
  requiresAgentActionApproval,
  resolveAgentActionGovernance
} from './agent-action-governance'

describe('agent action governance', () => {
  it('fails closed when the capability was not granted', () => {
    expect(
      resolveAgentActionGovernance({
        grant: 'not-granted',
        policy: 'allow'
      })
    ).toEqual({
      version: AGENT_ACTION_GOVERNANCE_VERSION,
      decision: 'deny',
      reason: 'missing-grant',
      forward: false
    })
  })

  it('fails closed when policy has not been evaluated', () => {
    expect(
      resolveAgentActionGovernance({
        grant: 'granted',
        policy: 'not-evaluated'
      })
    ).toMatchObject({ decision: 'deny', reason: 'policy-missing', forward: false })
  })

  it('preserves an explicit policy denial even when the capability is granted', () => {
    expect(
      resolveAgentActionGovernance({
        grant: 'granted',
        policy: 'deny'
      })
    ).toMatchObject({ decision: 'deny', reason: 'policy-denied', forward: false })
  })

  it('stops execution when human approval is required', () => {
    const result = resolveAgentActionGovernance({
      grant: 'granted',
      policy: 'require-approval'
    })

    expect(result).toMatchObject({
      decision: 'require-approval',
      reason: 'approval-required',
      forward: false
    })
    expect(requiresAgentActionApproval(result)).toBe(true)
  })

  it('forwards only after both grant and policy permit the action', () => {
    expect(
      resolveAgentActionGovernance({
        grant: 'granted',
        policy: 'allow'
      })
    ).toMatchObject({ decision: 'allow', reason: 'allowed', forward: true })
  })

  it('keeps the action-effect vocabulary closed', () => {
    expect(isAgentActionEffect('write-workspace')).toBe(true)
    expect(isAgentActionEffect('control-computer')).toBe(true)
    expect(isAgentActionEffect('do-anything')).toBe(false)
  })
})
