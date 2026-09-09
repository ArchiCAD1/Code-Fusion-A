export const AGENT_ACTION_GOVERNANCE_VERSION = 1 as const

export const AGENT_ACTION_EFFECTS = [
  'read-workspace',
  'write-workspace',
  'run-process',
  'read-git',
  'write-git',
  'read-browser',
  'mutate-browser',
  'control-computer',
  'read-mcp',
  'write-mcp',
  'read-model',
  'mutate-model',
  'manage-agent',
  'manage-credential'
] as const

export const AGENT_ACTION_GRANT_STATES = ['granted', 'not-granted'] as const
export const AGENT_ACTION_POLICY_VERDICTS = [
  'allow',
  'deny',
  'require-approval',
  'not-evaluated'
] as const
export const AGENT_ACTION_DECISIONS = ['allow', 'deny', 'require-approval'] as const
export const AGENT_ACTION_DECISION_REASONS = [
  'allowed',
  'missing-grant',
  'policy-denied',
  'policy-missing',
  'approval-required'
] as const

export type AgentActionGovernanceVersion = typeof AGENT_ACTION_GOVERNANCE_VERSION
export type AgentActionEffect = (typeof AGENT_ACTION_EFFECTS)[number]
export type AgentActionGrantState = (typeof AGENT_ACTION_GRANT_STATES)[number]
export type AgentActionPolicyVerdict = (typeof AGENT_ACTION_POLICY_VERDICTS)[number]
export type AgentActionDecisionKind = (typeof AGENT_ACTION_DECISIONS)[number]
export type AgentActionDecisionReason = (typeof AGENT_ACTION_DECISION_REASONS)[number]

export interface AgentActionGovernanceInput {
  grant: AgentActionGrantState
  policy: AgentActionPolicyVerdict
}

/**
 * Pure authorization result. Execution details and credentials do not belong in this contract.
 */
export interface AgentActionGovernanceDecision {
  version: AgentActionGovernanceVersion
  decision: AgentActionDecisionKind
  reason: AgentActionDecisionReason
  forward: boolean
}

/**
 * Combines two independent questions: whether the agent has the capability grant and whether the
 * current action is permitted now. Both must be explicit before work can proceed.
 */
export function resolveAgentActionGovernance(
  input: AgentActionGovernanceInput
): AgentActionGovernanceDecision {
  if (input.grant !== 'granted') {
    return decision('deny', 'missing-grant', false)
  }

  switch (input.policy) {
    case 'deny':
      return decision('deny', 'policy-denied', false)
    case 'require-approval':
      return decision('require-approval', 'approval-required', false)
    case 'allow':
      return decision('allow', 'allowed', true)
    case 'not-evaluated':
      return decision('deny', 'policy-missing', false)
  }
}

export function isAgentActionEffect(value: unknown): value is AgentActionEffect {
  return typeof value === 'string' && AGENT_ACTION_EFFECTS.includes(value as AgentActionEffect)
}

export function requiresAgentActionApproval(
  result: Pick<AgentActionGovernanceDecision, 'decision'>
): boolean {
  return result.decision === 'require-approval'
}

function decision(
  result: AgentActionDecisionKind,
  reason: AgentActionDecisionReason,
  forward: boolean
): AgentActionGovernanceDecision {
  return {
    version: AGENT_ACTION_GOVERNANCE_VERSION,
    decision: result,
    reason,
    forward
  }
}
