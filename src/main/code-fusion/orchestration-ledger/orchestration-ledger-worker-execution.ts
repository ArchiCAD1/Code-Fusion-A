import type {
  OrchestrationLedgerAggregateType,
  OrchestrationLedgerReadOptions,
  OrchestrationLedgerRecord
} from '../../../shared/code-fusion/orchestration-ledger'
import type { CoreOrchestrationLedgerEventInput } from '../../../shared/code-fusion/orchestration-ledger-core-events'
import {
  ORCHESTRATION_LEDGER_WORKER_PROTOCOL_VERSION,
  type OrchestrationLedgerWorkerRequest,
  type OrchestrationLedgerWorkerResponse
} from './orchestration-ledger-worker-protocol'

export type OrchestrationLedgerWorkerService = {
  getSchemaVersion(): number
  getLatestSequence(): number
  appendCore(event: CoreOrchestrationLedgerEventInput): OrchestrationLedgerRecord
  appendCoreMany(
    events: readonly CoreOrchestrationLedgerEventInput[]
  ): readonly OrchestrationLedgerRecord[]
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

/** Execute one validated request against the worker-owned synchronous ledger service. */
export function executeOrchestrationLedgerWorkerRequest(
  service: OrchestrationLedgerWorkerService,
  request: OrchestrationLedgerWorkerRequest
): OrchestrationLedgerWorkerResponse {
  try {
    switch (request.operation) {
      case 'getSchemaVersion':
        return success(request, service.getSchemaVersion())
      case 'getLatestSequence':
        return success(request, service.getLatestSequence())
      case 'appendCore':
        return success(request, service.appendCore(request.payload.event))
      case 'appendCoreMany':
        return success(request, service.appendCoreMany(request.payload.events))
      case 'readAfter':
        return success(request, service.readAfter(request.payload.options))
      case 'readAggregate':
        return success(
          request,
          service.readAggregate(
            request.payload.aggregateType,
            request.payload.aggregateId,
            request.payload.options
          )
        )
      case 'readProject':
        return success(
          request,
          service.readProject(request.payload.projectId, request.payload.options)
        )
      case 'close':
        service.close()
        return success(request, null)
    }
  } catch (error) {
    return {
      protocolVersion: ORCHESTRATION_LEDGER_WORKER_PROTOCOL_VERSION,
      id: request.id,
      operation: request.operation,
      ok: false,
      error: serializeLedgerWorkerError(error)
    }
  }
}

function success(
  request: OrchestrationLedgerWorkerRequest,
  result: Extract<OrchestrationLedgerWorkerResponse, { ok: true }>['result']
): OrchestrationLedgerWorkerResponse {
  return {
    protocolVersion: ORCHESTRATION_LEDGER_WORKER_PROTOCOL_VERSION,
    id: request.id,
    operation: request.operation,
    ok: true,
    result
  }
}

export function serializeLedgerWorkerError(
  error: unknown
): Extract<OrchestrationLedgerWorkerResponse, { ok: false }>['error'] {
  const candidate = error instanceof Error ? error : new Error(String(error))
  const rawCode = (candidate as Error & { code?: unknown }).code
  return {
    name: candidate.name || 'Error',
    message: redactLedgerWorkerErrorMessage(candidate.message),
    ...(typeof rawCode === 'string' && rawCode.length > 0 ? { code: rawCode } : {})
  }
}

export function redactLedgerWorkerErrorMessage(message: string): string {
  const normalized = message.trim() || 'Code Fusion orchestration ledger request failed'
  return normalized
    .slice(0, 2_000)
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/((?:api[_-]?key|token|authorization)=)[^&\s]+/gi, '$1[redacted]')
}
