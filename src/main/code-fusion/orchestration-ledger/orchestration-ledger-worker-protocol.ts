import {
  ORCHESTRATION_LEDGER_AGGREGATE_TYPES,
  type OrchestrationLedgerAggregateType,
  type OrchestrationLedgerReadOptions,
  type OrchestrationLedgerRecord
} from '../../../shared/code-fusion/orchestration-ledger'
import type { CoreOrchestrationLedgerEventInput } from '../../../shared/code-fusion/orchestration-ledger-core-events'

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
  if (value.ok) return Object.prototype.hasOwnProperty.call(value, 'result')
  return (
    isRecord(value.error) &&
    isNonEmptyString(value.error.name) &&
    isNonEmptyString(value.error.message) &&
    (value.error.code === undefined || typeof value.error.code === 'string')
  )
}

function isCoreEventInput(value: unknown): value is CoreOrchestrationLedgerEventInput {
  if (!isRecord(value)) return false
  return (
    isNonEmptyString(value.eventId) &&
    isNonEmptyString(value.occurredAt) &&
    isNonEmptyString(value.aggregateId) &&
    isNonEmptyString(value.eventType) &&
    Object.prototype.hasOwnProperty.call(value, 'payload')
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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
