import { describe, expect, it } from 'vitest'
import {
  ORCHESTRATION_LEDGER_WORKER_PROTOCOL_VERSION,
  isOrchestrationLedgerWorkerData,
  isOrchestrationLedgerWorkerRequest,
  isOrchestrationLedgerWorkerResponse
} from './orchestration-ledger-worker-protocol'

const event = {
  eventId: 'evt-1',
  occurredAt: '2026-09-03T18:00:00.000Z',
  aggregateId: 'task-1',
  eventType: 'task.created',
  payload: { title: 'Investigate native runtime' }
}

const record = {
  ...event,
  aggregateType: 'task',
  sequence: 1
}

describe('orchestration ledger worker protocol', () => {
  it('accepts the bounded worker data and operation-specific request envelopes', () => {
    expect(isOrchestrationLedgerWorkerData({ profileStorageDirectory: '/tmp/profile' })).toBe(true)
    expect(
      isOrchestrationLedgerWorkerRequest({
        protocolVersion: ORCHESTRATION_LEDGER_WORKER_PROTOCOL_VERSION,
        id: 1,
        operation: 'appendCore',
        payload: { event }
      })
    ).toBe(true)
    expect(
      isOrchestrationLedgerWorkerRequest({
        protocolVersion: ORCHESTRATION_LEDGER_WORKER_PROTOCOL_VERSION,
        id: 2,
        operation: 'readAggregate',
        payload: { aggregateType: 'task', aggregateId: 'task-1', options: { limit: 20 } }
      })
    ).toBe(true)
  })

  it('rejects invalid worker data and request metadata', () => {
    expect(isOrchestrationLedgerWorkerData({ profileStorageDirectory: '  ' })).toBe(false)
    expect(
      isOrchestrationLedgerWorkerRequest({
        protocolVersion: 2,
        id: 1,
        operation: 'getLatestSequence',
        payload: null
      })
    ).toBe(false)
    expect(
      isOrchestrationLedgerWorkerRequest({
        protocolVersion: ORCHESTRATION_LEDGER_WORKER_PROTOCOL_VERSION,
        id: 0,
        operation: 'getLatestSequence',
        payload: null
      })
    ).toBe(false)
    expect(
      isOrchestrationLedgerWorkerRequest({
        protocolVersion: ORCHESTRATION_LEDGER_WORKER_PROTOCOL_VERSION,
        id: 1,
        operation: 'deleteEverything',
        payload: null
      })
    ).toBe(false)
  })

  it('rejects operation-specific request payload mismatches', () => {
    expect(
      isOrchestrationLedgerWorkerRequest({
        protocolVersion: ORCHESTRATION_LEDGER_WORKER_PROTOCOL_VERSION,
        id: 1,
        operation: 'getSchemaVersion',
        payload: {}
      })
    ).toBe(false)
    expect(
      isOrchestrationLedgerWorkerRequest({
        protocolVersion: ORCHESTRATION_LEDGER_WORKER_PROTOCOL_VERSION,
        id: 1,
        operation: 'appendCore',
        payload: {
          event: {
            ...event,
            eventType: 'task.arbitrary'
          }
        }
      })
    ).toBe(false)
    expect(
      isOrchestrationLedgerWorkerRequest({
        protocolVersion: ORCHESTRATION_LEDGER_WORKER_PROTOCOL_VERSION,
        id: 1,
        operation: 'readAggregate',
        payload: { aggregateType: 'arbitrary', aggregateId: 'task-1' }
      })
    ).toBe(false)
    expect(
      isOrchestrationLedgerWorkerRequest({
        protocolVersion: ORCHESTRATION_LEDGER_WORKER_PROTOCOL_VERSION,
        id: 1,
        operation: 'readAfter',
        payload: { options: { limit: 0 } }
      })
    ).toBe(false)
  })

  it('accepts operation-specific successful response results', () => {
    expect(
      isOrchestrationLedgerWorkerResponse({
        protocolVersion: ORCHESTRATION_LEDGER_WORKER_PROTOCOL_VERSION,
        id: 1,
        operation: 'getSchemaVersion',
        ok: true,
        result: 1
      })
    ).toBe(true)
    expect(
      isOrchestrationLedgerWorkerResponse({
        protocolVersion: ORCHESTRATION_LEDGER_WORKER_PROTOCOL_VERSION,
        id: 2,
        operation: 'getLatestSequence',
        ok: true,
        result: 0
      })
    ).toBe(true)
    expect(
      isOrchestrationLedgerWorkerResponse({
        protocolVersion: ORCHESTRATION_LEDGER_WORKER_PROTOCOL_VERSION,
        id: 3,
        operation: 'appendCore',
        ok: true,
        result: record
      })
    ).toBe(true)
    expect(
      isOrchestrationLedgerWorkerResponse({
        protocolVersion: ORCHESTRATION_LEDGER_WORKER_PROTOCOL_VERSION,
        id: 4,
        operation: 'readProject',
        ok: true,
        result: [record]
      })
    ).toBe(true)
    expect(
      isOrchestrationLedgerWorkerResponse({
        protocolVersion: ORCHESTRATION_LEDGER_WORKER_PROTOCOL_VERSION,
        id: 5,
        operation: 'close',
        ok: true,
        result: null
      })
    ).toBe(true)
  })

  it('rejects successful response envelopes with the wrong result type', () => {
    expect(
      isOrchestrationLedgerWorkerResponse({
        protocolVersion: ORCHESTRATION_LEDGER_WORKER_PROTOCOL_VERSION,
        id: 1,
        operation: 'getLatestSequence',
        ok: true,
        result: '1'
      })
    ).toBe(false)
    expect(
      isOrchestrationLedgerWorkerResponse({
        protocolVersion: ORCHESTRATION_LEDGER_WORKER_PROTOCOL_VERSION,
        id: 2,
        operation: 'appendCore',
        ok: true,
        result: { ...record, sequence: 0 }
      })
    ).toBe(false)
    expect(
      isOrchestrationLedgerWorkerResponse({
        protocolVersion: ORCHESTRATION_LEDGER_WORKER_PROTOCOL_VERSION,
        id: 3,
        operation: 'readAfter',
        ok: true,
        result: [{ arbitrary: true }]
      })
    ).toBe(false)
    expect(
      isOrchestrationLedgerWorkerResponse({
        protocolVersion: ORCHESTRATION_LEDGER_WORKER_PROTOCOL_VERSION,
        id: 4,
        operation: 'close',
        ok: true,
        result: []
      })
    ).toBe(false)
  })

  it('validates failure responses without accepting malformed errors', () => {
    expect(
      isOrchestrationLedgerWorkerResponse({
        protocolVersion: ORCHESTRATION_LEDGER_WORKER_PROTOCOL_VERSION,
        id: 1,
        operation: 'readProject',
        ok: false,
        error: { name: 'Error', message: 'failed', code: 'SQLITE_BUSY' }
      })
    ).toBe(true)
    expect(
      isOrchestrationLedgerWorkerResponse({
        protocolVersion: ORCHESTRATION_LEDGER_WORKER_PROTOCOL_VERSION,
        id: 1,
        operation: 'readProject',
        ok: false,
        error: { name: '', message: '' }
      })
    ).toBe(false)
  })
})
