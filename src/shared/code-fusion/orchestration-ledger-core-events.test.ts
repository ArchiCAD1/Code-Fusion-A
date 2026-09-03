import { describe, expect, it } from 'vitest'

import {
  CORE_ORCHESTRATION_LEDGER_EVENTS,
  createCoreOrchestrationLedgerEvent,
  resolveCoreOrchestrationLedgerAggregateType
} from './orchestration-ledger-core-events'

describe('Code Fusion core orchestration ledger events', () => {
  it('maps every core event to an explicit aggregate owner', () => {
    expect(Object.keys(CORE_ORCHESTRATION_LEDGER_EVENTS)).toHaveLength(16)
    expect(resolveCoreOrchestrationLedgerAggregateType('task.created')).toBe('task')
    expect(resolveCoreOrchestrationLedgerAggregateType('agent-run.started')).toBe('agent-run')
    expect(resolveCoreOrchestrationLedgerAggregateType('runtime-check.recorded')).toBe(
      'runtime-check'
    )
    expect(resolveCoreOrchestrationLedgerAggregateType('approval.recorded')).toBe('approval')
  })

  it('derives aggregate type while preserving event provenance metadata', () => {
    expect(
      createCoreOrchestrationLedgerEvent({
        eventId: 'event-1',
        occurredAt: '2026-09-02T21:00:00.000Z',
        projectId: 'project-1',
        aggregateId: 'task-1',
        eventType: 'task.status-changed',
        payload: { from: 'planned', to: 'active' },
        actor: { kind: 'agent', id: 'codex' },
        source: 'desktop',
        correlationId: 'task-1',
        causationId: 'event-0'
      })
    ).toEqual({
      eventId: 'event-1',
      occurredAt: '2026-09-02T21:00:00.000Z',
      projectId: 'project-1',
      aggregateType: 'task',
      aggregateId: 'task-1',
      eventType: 'task.status-changed',
      payload: { from: 'planned', to: 'active' },
      actor: { kind: 'agent', id: 'codex' },
      source: 'desktop',
      correlationId: 'task-1',
      causationId: 'event-0'
    })
  })

  it('rejects an unknown event name at runtime instead of creating an ad-hoc core event', () => {
    expect(() =>
      resolveCoreOrchestrationLedgerAggregateType(
        'task.surprise' as Parameters<typeof resolveCoreOrchestrationLedgerAggregateType>[0]
      )
    ).toThrow('Unsupported Code Fusion core ledger event type')
  })
})
