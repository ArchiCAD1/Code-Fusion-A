import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'

import type { OrchestrationLedgerEventInput } from '../../../shared/code-fusion/orchestration-ledger'
import { resolveCodeFusionLedgerPath } from './ledger-path'
import { SqliteOrchestrationLedgerStore } from './sqlite-ledger-store'

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function event(
  eventId: string,
  overrides: Partial<OrchestrationLedgerEventInput> = {}
): OrchestrationLedgerEventInput {
  return {
    eventId,
    occurredAt: '2026-09-02T20:00:00.000Z',
    projectId: 'project-1',
    aggregateType: 'task',
    aggregateId: 'task-1',
    eventType: 'task.created',
    payload: { title: 'Fix PDF renderer' },
    actor: { kind: 'agent', id: 'codex' },
    source: 'desktop',
    correlationId: 'task-1',
    ...overrides
  }
}

describe('SqliteOrchestrationLedgerStore', () => {
  it('creates schema v1 and appends a durable ordered event', () => {
    const store = new SqliteOrchestrationLedgerStore(':memory:')
    const record = store.append(event('event-1'))

    expect(store.getSchemaVersion()).toBe(1)
    expect(record.sequence).toBe(1)
    expect(store.getLatestSequence()).toBe(1)
    expect(store.readAfter()).toEqual([record])
    store.close()
  })

  it('filters aggregate and project history without changing global ordering', () => {
    const store = new SqliteOrchestrationLedgerStore(':memory:')
    store.appendMany([
      event('event-1'),
      event('event-2', { aggregateId: 'task-2', correlationId: 'task-2' }),
      event('event-3', { projectId: 'project-2', aggregateId: 'task-3' })
    ])

    expect(store.readAggregate('task', 'task-1').map((item) => item.eventId)).toEqual([
      'event-1'
    ])
    expect(store.readProject('project-1').map((item) => item.eventId)).toEqual([
      'event-1',
      'event-2'
    ])
    expect(store.readAfter({ afterSequence: 1 }).map((item) => item.sequence)).toEqual([2, 3])
    store.close()
  })

  it('rolls back an entire batch when one event violates uniqueness', () => {
    const store = new SqliteOrchestrationLedgerStore(':memory:')
    store.append(event('existing'))

    expect(() => store.appendMany([event('new-event'), event('existing')])).toThrow()
    expect(store.readAfter().map((item) => item.eventId)).toEqual(['existing'])
    expect(store.getLatestSequence()).toBe(1)
    store.close()
  })

  it('persists events across close and reopen for a profile-sidecar database', () => {
    const directory = mkdtempSync(join(tmpdir(), 'code-fusion-ledger-'))
    temporaryDirectories.push(directory)
    const path = resolveCodeFusionLedgerPath(directory)

    const first = new SqliteOrchestrationLedgerStore(path)
    first.append(event('durable-event'))
    first.close()

    const reopened = new SqliteOrchestrationLedgerStore(path)
    expect(reopened.getSchemaVersion()).toBe(1)
    expect(reopened.readAfter().map((item) => item.eventId)).toEqual(['durable-event'])
    reopened.close()
  })

  it('rejects invalid timestamps and invalid read windows before recording evidence', () => {
    const store = new SqliteOrchestrationLedgerStore(':memory:')

    expect(() => store.append(event('bad-time', { occurredAt: 'yesterday' }))).toThrow(
      'canonical ISO timestamp'
    )
    expect(() => store.readAfter({ afterSequence: -1 })).toThrow('afterSequence')
    expect(() => store.readAfter({ limit: 1_001 })).toThrow('limit')
    expect(store.getLatestSequence()).toBe(0)
    store.close()
  })

  it('is append-only at the public contract and becomes unusable after close', () => {
    const store = new SqliteOrchestrationLedgerStore(':memory:')
    store.append(event('event-1'))
    store.close()

    expect(() => store.getLatestSequence()).toThrow('closed')
    expect(() => store.append(event('event-2'))).toThrow('closed')
  })
})
