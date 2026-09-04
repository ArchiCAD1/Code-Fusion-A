import {
  ORCHESTRATION_LEDGER_AGGREGATE_TYPES,
  type OrchestrationLedgerActor,
  type OrchestrationLedgerAggregateType,
  type OrchestrationLedgerReadOptions,
  type OrchestrationLedgerRecord
} from '../../../shared/code-fusion/orchestration-ledger'
import {
  CORE_ORCHESTRATION_LEDGER_EVENTS,
  type CoreOrchestrationLedgerEventInput
} from '../../../shared/code-fusion/orchestration-ledger-core-events'

export const ORCHESTRATION_LEDGER_WORKER_PROTOCOL_VERSION = 1 as const
export const ORCHESTRATION_LEDGER_WORKER_REQUEST_TIMEOUT_MS = 15_000
export const ORCHESTRATION_LEDGER_WORKER_MAX_PENDING_REQUESTS = 256

export type OrchestrationLedgerWorkerData = {
  profileStorageDirectory: string
}

export type OrchestrationLedgerWorkerOperation =
  | 'getSchemaVersion'
  | 'getLatestSequence'
  | 'appendCore'
  | 'appendCoreMany'
  | 'readAfter'
  | 'readAggregate'
  | 'readProject'
  | 'close'

type WorkerRequestBase = {
  protocolVersion: typeof ORCHESTRATION_LEDGER_WORKER_PROTOCOL_VERSION
  id: number
}

export type OrchestrationLedgerWorkerRequest =
  | (WorkerRequestBase & { operation: 'getSchemaVersion'; payload: null })
  | (WorkerRequestBase & { operation: 'getLatestSequence'; payload: null })
  | (WorkerRequestBase & {
      operation: 'appendCore'
      payload: { event: CoreOrchestrationLedgerEventInput }
    })
  | (WorkerRequestBase & {
      operation: 'appendCoreMany'
      payload: { events: readonly CoreOrchestrationLedgerEventInput[] }
    })
  | (WorkerRequestBase & {
      operation: 'readAfter'
      payload: { options?: OrchestrationLedgerReadOptions }
    })
  | (WorkerRequestBase & {
      operation: 'readAggregate'
      payload: {
        aggregateType: OrchestrationLedgerAggregateType
        aggregateId: string
        options?: OrchestrationLedgerReadOptions
      }
    })
  | (WorkerRequestBase & {
      operation: 'readProject'
      payload: { projectId: string; options?: OrchestrationLedgerReadOptions }
    })
  | (WorkerRequestBase & { operation: 'close'; payload: null })

export type OrchestrationLedgerWorkerSuccessResult =
  | number
  | readonly OrchestrationLedgerRecord[]
  | OrchestrationLedgerRecord
  | null

export type OrchestrationLedgerWorkerResponse =
  | {
      protocolVersion: typeof ORCHESTRATION_LEDGER_WORKER_PROTOCOL_VERSION
      id: number
      operation: OrchestrationLedgerWorkerOperation
      ok: true
      result: OrchestrationLedgerWorkerSuccessResult
    }
  | {
      protocolVersion: typeof ORCHESTRATION_LEDGER_WORKER_PROTOCOL_VERSION
      id: number
      operation: OrchestrationLedgerWorkerOperation
      ok: false
      error: { name: string; message: string; code?: string }
    }

const OPERATIONS = new Set<OrchestrationLedgerWorkerOperation>([
  'getSchemaVersion',
  'getLatestSequence',
  'appendCore',
  'appendCoreMany',
  'readAfter',
  'readAggregate',
  'readProject',
  'close'
])
const AGGREGATE_TYPES = new Set<string>(ORCHESTRATION_LEDGER_AGGREGATE_TYPES)
const CORE_EVENT_TYPES = new Set<string>(Object.keys(CORE_ORCHESTRATION_LEDGER_EVENTS))
const ACTOR_KINDS = new Set<OrchestrationLedgerActor['kind']>([
  'human',
  'agent',
  'system',
  'external'
])

export function isOrchestrationLedgerWorkerData(
  value: unknown
): value is OrchestrationLedgerWorkerData {
  if (!isRecord(value)) return false
  return (
    typeof value.profileStorageDirectory === 'string' &&
    value.profileStorageDirectory.trim().length > 0
  )
}

export function isOrchestrationLedgerWorkerRequest(
  value: unknown
): value is OrchestrationLedgerWorkerRequest {
  if (!isRecord(value)) return false
  if (value.protocolVersion !== ORCHESTRATION_LEDGER_WORKER_PROTOCOL_VERSION) return false
  if (!Number.isSafeInteger(value.id) || Number(value.id) <= 0) return false
  if (
    typeof value.operation !== 'string' ||
    !OPERATIONS.has(value.operation as OrchestrationLedgerWorkerOperation)
  ) {
    return false
  }

  switch (value.operation as OrchestrationLedgerWorkerOperation) {
    case 'getSchemaVersion':
    case 'getLatestSequence':
    case 'close':
      return value.payload === null
    case 'appendCore':
      return isRecord(value.payload) && isCoreEventInput(value.payload.event)
    case 'appendCoreMany':
      return (
        isRecord(value.payload) &&
        Array.isArray(value.payload.events) &&
        value.payload.events.every(isCoreEventInput)
      )
    case 'readAfter':
      return isRecord(value.payload) && isReadOptions(value.payload.options)
    case 'readAggregate':
      return (
        isRecord(value.payload) &&
        typeof value.payload.aggregateType === 'string' &&
        AGGREGATE_TYPES.has(value.payload.aggregateType) &&
        isNonEmptyString(value.payload.aggregateId) &&
        isReadOptions(value.payload.options)
      )
    case 'readProject':
      return (
        isRecord(value.payload) &&
        isNonEmptyString(value.payload.projectId) &&
        isReadOptions(value.payload.options)
      )
  }
}

export function isOrchestrationLedgerWorkerResponse(
  value: unknown
): value is OrchestrationLedgerWorkerResponse {
  if (!isRecord(value)) return false
  if (value.protocolVersion !== ORCHESTRATION_LEDGER_WORKER_PROTOCOL_VERSION) return false
  if (!Number.isSafeInteger(value.id) || Number(value.id) <= 0) return false
  if (
    typeof value.operation !== 'string' ||
    !OPERATIONS.has(value.operation as OrchestrationLedgerWorkerOperation)
  ) {
    return false
  }
  if (typeof value.ok !== 'boolean') return false
  if (value.ok) {
    return isSuccessResult(value.operation as OrchestrationLedgerWorkerOperation, value.result)
  }
  return (
    isRecord(value.error) &&
    isNonEmptyString(value.error.name) &&
    isNonEmptyString(value.error.message) &&
    (value.error.code === undefined || typeof value.error.code === 'string')
  )
}

function isSuccessResult(
  operation: OrchestrationLedgerWorkerOperation,
  result: unknown
): result is OrchestrationLedgerWorkerSuccessResult {
  switch (operation) {
    case 'getSchemaVersion':
      return Number.isSafeInteger(result) && Number(result) > 0
    case 'getLatestSequence':
      return Number.isSafeInteger(result) && Number(result) >= 0
    case 'appendCore':
      return isLedgerRecord(result)
    case 'appendCoreMany':
    case 'readAfter':
    case 'readAggregate':
    case 'readProject':
      return Array.isArray(result) && result.every(isLedgerRecord)
    case 'close':
      return result === null
  }
}

function isLedgerRecord(value: unknown): value is OrchestrationLedgerRecord {
  if (!isRecord(value)) return false
  if (!Number.isSafeInteger(value.sequence) || Number(value.sequence) <= 0) return false
  if (!isNonEmptyString(value.eventId)) return false
  if (!isNonEmptyString(value.occurredAt)) return false
  if (typeof value.aggregateType !== 'string' || !AGGREGATE_TYPES.has(value.aggregateType)) {
    return false
  }
  if (!isNonEmptyString(value.aggregateId) || !isNonEmptyString(value.eventType)) return false
  if (!Object.prototype.hasOwnProperty.call(value, 'payload')) return false
  if (!isOptionalNonEmptyString(value.projectId)) return false
  if (!isOptionalActor(value.actor)) return false
  return (
    isOptionalNonEmptyString(value.source) &&
    isOptionalNonEmptyString(value.correlationId) &&
    isOptionalNonEmptyString(value.causationId)
  )
}

function isCoreEventInput(value: unknown): value is CoreOrchestrationLedgerEventInput {
  if (!isRecord(value)) return false
  if (!isNonEmptyString(value.eventId)) return false
  if (!isNonEmptyString(value.occurredAt)) return false
  if (!isNonEmptyString(value.aggregateId)) return false
  if (typeof value.eventType !== 'string' || !CORE_EVENT_TYPES.has(value.eventType)) return false
  if (!Object.prototype.hasOwnProperty.call(value, 'payload')) return false
  if (!isOptionalNonEmptyString(value.projectId)) return false
  if (!isOptionalActor(value.actor)) return false
  return (
    isOptionalNonEmptyString(value.source) &&
    isOptionalNonEmptyString(value.correlationId) &&
    isOptionalNonEmptyString(value.causationId)
  )
}

function isOptionalActor(value: unknown): boolean {
  if (value === undefined) return true
  if (!isRecord(value)) return false
  return (
    typeof value.kind === 'string' &&
    ACTOR_KINDS.has(value.kind as OrchestrationLedgerActor['kind']) &&
    isOptionalNonEmptyString(value.id)
  )
}

function isReadOptions(value: unknown): boolean {
  if (value === undefined) return true
  if (!isRecord(value)) return false
  return (
    (value.afterSequence === undefined ||
      (Number.isSafeInteger(value.afterSequence) && Number(value.afterSequence) >= 0)) &&
    (value.limit === undefined || (Number.isSafeInteger(value.limit) && Number(value.limit) > 0))
  )
}

function isOptionalNonEmptyString(value: unknown): boolean {
  return value === undefined || isNonEmptyString(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
