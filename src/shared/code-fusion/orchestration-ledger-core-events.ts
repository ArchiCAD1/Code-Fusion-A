import type {
  JsonValue,
  OrchestrationLedgerActor,
  OrchestrationLedgerAggregateType,
  OrchestrationLedgerEventInput
} from './orchestration-ledger'

export const CORE_ORCHESTRATION_LEDGER_EVENTS = {
  'project.registered': 'project',
  'task.created': 'task',
  'task.status-changed': 'task',
  'agent-run.started': 'agent-run',
  'agent-run.completed': 'agent-run',
  'workspace.observed': 'workspace',
  'model.observed': 'model',
  'session.observed': 'session',
  'commit.observed': 'commit',
  'build.completed': 'build',
  'test-run.completed': 'test-run',
  'runtime-check.recorded': 'runtime-check',
  'defect.recorded': 'defect',
  'evidence.recorded': 'evidence',
  'approval.recorded': 'approval',
  'mobile-state.observed': 'mobile-state'
} as const satisfies Record<string, OrchestrationLedgerAggregateType>

export type CoreOrchestrationLedgerEventType = keyof typeof CORE_ORCHESTRATION_LEDGER_EVENTS

export type CoreOrchestrationLedgerEventInput = {
  eventId: string
  occurredAt: string
  projectId?: string
  aggregateId: string
  eventType: CoreOrchestrationLedgerEventType
  payload: JsonValue
  actor?: OrchestrationLedgerActor
  source?: string
  correlationId?: string
  causationId?: string
}

/**
 * Produces a canonical core event envelope and derives aggregate ownership from the event name.
 * This prevents live integrations from inventing mismatched aggregate/event combinations.
 */
export function createCoreOrchestrationLedgerEvent(
  input: CoreOrchestrationLedgerEventInput
): OrchestrationLedgerEventInput {
  const aggregateType = resolveCoreOrchestrationLedgerAggregateType(input.eventType)
  return {
    eventId: input.eventId,
    occurredAt: input.occurredAt,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    aggregateType,
    aggregateId: input.aggregateId,
    eventType: input.eventType,
    payload: input.payload,
    ...(input.actor ? { actor: input.actor } : {}),
    ...(input.source ? { source: input.source } : {}),
    ...(input.correlationId ? { correlationId: input.correlationId } : {}),
    ...(input.causationId ? { causationId: input.causationId } : {})
  }
}

export function resolveCoreOrchestrationLedgerAggregateType(
  eventType: CoreOrchestrationLedgerEventType
): OrchestrationLedgerAggregateType {
  const aggregateType = (CORE_ORCHESTRATION_LEDGER_EVENTS as Record<string, OrchestrationLedgerAggregateType>)[
    eventType
  ]
  if (!aggregateType) {
    throw new Error(`Unsupported Code Fusion core ledger event type: ${String(eventType)}`)
  }
  return aggregateType
}
