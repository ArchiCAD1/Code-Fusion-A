import { describe, expect, it, vi } from 'vitest'
import type { OrchestrationLedgerWorkerService } from './orchestration-ledger-worker-execution'
import { executeOrchestrationLedgerWorkerRequest } from './orchestration-ledger-worker-execution'
import {
  ORCHESTRATION_LEDGER_WORKER_PROTOCOL_VERSION,
  type OrchestrationLedgerWorkerRequest
} from './orchestration-ledger-worker-protocol'

function request(
  operation: OrchestrationLedgerWorkerRequest['operation'],
  payload: OrchestrationLedgerWorkerRequest['payload']
): OrchestrationLedgerWorkerRequest {
  return {
    protocolVersion: ORCHESTRATION_LEDGER_WORKER_PROTOCOL_VERSION,
    id: 1,
    operation,
    payload
  } as OrchestrationLedgerWorkerRequest
}

function makeService(): OrchestrationLedgerWorkerService {
  return {
    getSchemaVersion: vi.fn(() => 1),
    getLatestSequence: vi.fn(() => 7),
    appendCore: vi.fn((event) => ({ ...event, aggregateType: 'task', sequence: 8 })),
    appendCoreMany: vi.fn(() => []),
    readAfter: vi.fn(() => []),
    readAggregate: vi.fn(() => []),
    readProject: vi.fn(() => []),
    close: vi.fn()
  }
}

describe('executeOrchestrationLedgerWorkerRequest', () => {
  it('dispatches reads, writes and close to the worker-owned service', () => {
    const service = makeService()

    expect(
      executeOrchestrationLedgerWorkerRequest(service, request('getSchemaVersion', null))
    ).toMatchObject({ ok: true, result: 1 })
    expect(
      executeOrchestrationLedgerWorkerRequest(service, request('getLatestSequence', null))
    ).toMatchObject({ ok: true, result: 7 })

    const event = {
      eventId: 'evt-1',
      occurredAt: '2026-09-03T18:00:00.000Z',
      aggregateId: 'task-1',
      eventType: 'task.created' as const,
      payload: { title: 'Test' }
    }
    expect(
      executeOrchestrationLedgerWorkerRequest(service, request('appendCore', { event }))
    ).toMatchObject({ ok: true, result: { sequence: 8 } })
    expect(service.appendCore).toHaveBeenCalledWith(event)

    expect(
      executeOrchestrationLedgerWorkerRequest(service, request('close', null))
    ).toMatchObject({ ok: true, result: null })
    expect(service.close).toHaveBeenCalledOnce()
  })

  it('passes read filters to the service without widening them', () => {
    const service = makeService()
    executeOrchestrationLedgerWorkerRequest(
      service,
      request('readAggregate', {
        aggregateType: 'task',
        aggregateId: 'task-1',
        options: { afterSequence: 3, limit: 20 }
      })
    )
    executeOrchestrationLedgerWorkerRequest(
      service,
      request('readProject', { projectId: 'project-1', options: { limit: 10 } })
    )

    expect(service.readAggregate).toHaveBeenCalledWith('task', 'task-1', {
      afterSequence: 3,
      limit: 20
    })
    expect(service.readProject).toHaveBeenCalledWith('project-1', { limit: 10 })
  })

  it('serializes, bounds and redacts worker-side errors', () => {
    const service = makeService()
    vi.mocked(service.readProject).mockImplementation(() => {
      throw Object.assign(
        new Error(`Bearer secret token=abc ${'x'.repeat(2_500)}`),
        { code: 'SQLITE_BUSY' }
      )
    })

    const response = executeOrchestrationLedgerWorkerRequest(
      service,
      request('readProject', { projectId: 'project-1' })
    )

    expect(response).toMatchObject({
      protocolVersion: ORCHESTRATION_LEDGER_WORKER_PROTOCOL_VERSION,
      id: 1,
      operation: 'readProject',
      ok: false,
      error: { name: 'Error', code: 'SQLITE_BUSY' }
    })
    if (!response.ok) {
      expect(response.error.message).toContain('Bearer [redacted] token=[redacted]')
      expect(response.error.message.length).toBeLessThanOrEqual(2_000)
    }
  })
})
