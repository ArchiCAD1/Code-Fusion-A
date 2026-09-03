export const ORCHESTRATION_LEDGER_SCHEMA_VERSION = 1 as const

export const ORCHESTRATION_LEDGER_AGGREGATE_TYPES = [
  'project',
  'task',
  'agent-run',
  'workspace',
  'model',
  'session',
  'commit',
  'build',
  'test-run',
  'runtime-check',
  'defect',
  'evidence',
  'approval',
  'mobile-state'
] as const

export type OrchestrationLedgerAggregateType =
  (typeof ORCHESTRATION_LEDGER_AGGREGATE_TYPES)[number]

export type OrchestrationLedgerActorKind = 'human' | 'agent' | 'system' | 'external'

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export type OrchestrationLedgerActor = {
  kind: OrchestrationLedgerActorKind
  id?: string
}

export type OrchestrationLedgerEventInput = {
  eventId: string
  occurredAt: string
  projectId?: string
  aggregateType: OrchestrationLedgerAggregateType
  aggregateId: string
  eventType: string
  payload: JsonValue
  actor?: OrchestrationLedgerActor
  source?: string
  correlationId?: string
  causationId?: string
}

export type OrchestrationLedgerRecord = OrchestrationLedgerEventInput & {
  sequence: number
}

export type OrchestrationLedgerReadOptions = {
  afterSequence?: number
  limit?: number
}

export interface OrchestrationLedgerStore {
  getSchemaVersion(): number
  getLatestSequence(): number
  append(event: OrchestrationLedgerEventInput): OrchestrationLedgerRecord
  appendMany(events: readonly OrchestrationLedgerEventInput[]): readonly OrchestrationLedgerRecord[]
  readAfter(options?: OrchestrationLedgerReadOptions): readonly OrchestrationLedgerRecord[]
  readAggregate(
    aggregateType: OrchestrationLedgerAggregateType,
    aggregateId: string,
    options?: OrchestrationLedgerReadOptions
  ): readonly OrchestrationLedgerRecord[]
  readProject(
    projectId: string,
    options?: OrchestrationLedgerReadOptions
  ): readonly OrchestrationLedgerRecord[]
  close(): void
}
