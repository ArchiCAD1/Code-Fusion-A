import { describe, expect, it, vi } from 'vitest'

import type {
  OrchestrationLedgerEventInput,
  OrchestrationLedgerRecord,
  OrchestrationLedgerStore
} from '../../../shared/code-fusion/orchestration-ledger'
import type { CoreOrchestrationLedgerEventInput } from '../../../shared/code-fusion/orchestration-ledger-core-events'
import { resolveCodeFusionLedgerPath } from './ledger-path'
import { OrchestrationLedgerService } from './orchestration-ledger-service'

const PROFILE_DIRECTORY = '/tmp/code-fusion-profile'

function coreEvent(
  overrides: Partial<CoreOrchestrationLedgerEventInput> = {}
): CoreOrchestrationLedgerEventInput {
  return {
    eventId: 'event-1',
    occurredAt: '2026-09-03T12:00:00.000Z',
    projectId: 'project-1',
    aggregateId: 'task-1',
    eventType: 'task.created',
    payload: { title: 'Ledger service' },
    ...overrides
  }
}

function createStoreStub(): {
  store: OrchestrationLedgerStore
  append: ReturnType<typeof vi.fn>
  appendMany: ReturnType<typeof vi.fn>
  readAfter: ReturnType<typeof vi.fn>
  readAggregate: ReturnType<typeof vi.fn>
  readProject: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
} {
  let nextSequence = 1
  const toRecord = (event: OrchestrationLedgerEventInput): OrchestrationLedgerRecord => ({
    ...event,
    sequence: nextSequence++
  })
  const append = vi.fn((event: OrchestrationLedgerEventInput) => toRecord(event))
  const appendMany = vi.fn((events: readonly OrchestrationLedgerEventInput[]) => events.map(toRecord))
  const readAfter = vi.fn(() => [] as readonly OrchestrationLedgerRecord[])
  const readAggregate = vi.fn(() => [] as readonly OrchestrationLedgerRecord[])
  const readProject = vi.fn(() => [] as readonly OrchestrationLedgerRecord[])
  const close = vi.fn()
  return {
    append,
    appendMany,
    readAfter,
    readAggregate,
    readProject,
    close,
    store: {
      getSchemaVersion: vi.fn(() => 1),
      getLatestSequence: vi.fn(() => nextSequence - 1),
      append,
      appendMany,
      readAfter,
      readAggregate,
      readProject,
      close
    }
  }
}

describe('OrchestrationLedgerService', () => {
  it('is side-effect free until the first ledger operation', () => {
    const { store } = createStoreStub()
    const createStore = vi.fn(() => store)
    const service = new OrchestrationLedgerService(PROFILE_DIRECTORY, { createStore })

    expect(service.getState()).toBe('idle')
    expect(service.getStoragePath()).toBe(resolveCodeFusionLedgerPath(PROFILE_DIRECTORY))
    expect(createStore).not.toHaveBeenCalled()
  })

  it('opens one store lazily and derives canonical aggregate ownership for core events', () => {
    const { store, append } = createStoreStub()
    const createStore = vi.fn(() => store)
    const service = new OrchestrationLedgerService(PROFILE_DIRECTORY, { createStore })

    const record = service.appendCore(coreEvent())

    expect(createStore).toHaveBeenCalledTimes(1)
    expect(createStore).toHaveBeenCalledWith(resolveCodeFusionLedgerPath(PROFILE_DIRECTORY))
    expect(service.getState()).toBe('open')
    expect(record.aggregateType).toBe('task')
    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'task.created', aggregateType: 'task' })
    )

    service.getLatestSequence()
    expect(createStore).toHaveBeenCalledTimes(1)
  })

  it('derives aggregate ownership for every event in a transactional batch handoff', () => {
    const { store, appendMany } = createStoreStub()
    const service = new OrchestrationLedgerService(PROFILE_DIRECTORY, {
      createStore: () => store
    })

    const records = service.appendCoreMany([
      coreEvent({
        eventId: 'project-event',
        aggregateId: 'project-1',
        eventType: 'project.registered'
      }),
      coreEvent({
        eventId: 'build-event',
        aggregateId: 'build-1',
        eventType: 'build.completed'
      })
    ])

    expect(records.map((record) => record.aggregateType)).toEqual(['project', 'build'])
    expect(appendMany).toHaveBeenCalledWith([
      expect.objectContaining({ aggregateType: 'project', eventType: 'project.registered' }),
      expect.objectContaining({ aggregateType: 'build', eventType: 'build.completed' })
    ])
  })

  it('does not open storage for an empty batch', () => {
    const { store } = createStoreStub()
    const createStore = vi.fn(() => store)
    const service = new OrchestrationLedgerService(PROFILE_DIRECTORY, { createStore })

    expect(service.appendCoreMany([])).toEqual([])
    expect(service.getState()).toBe('idle')
    expect(createStore).not.toHaveBeenCalled()
  })

  it('passes bounded read requests through the single owned store', () => {
    const { store, readAfter, readAggregate, readProject } = createStoreStub()
    const service = new OrchestrationLedgerService(PROFILE_DIRECTORY, {
      createStore: () => store
    })

    service.readAfter({ afterSequence: 7, limit: 10 })
    service.readAggregate('task', 'task-1', { afterSequence: 8, limit: 11 })
    service.readProject('project-1', { afterSequence: 9, limit: 12 })

    expect(readAfter).toHaveBeenCalledWith({ afterSequence: 7, limit: 10 })
    expect(readAggregate).toHaveBeenCalledWith('task', 'task-1', {
      afterSequence: 8,
      limit: 11
    })
    expect(readProject).toHaveBeenCalledWith('project-1', { afterSequence: 9, limit: 12 })
  })

  it('can close before first use without creating a database and remains idempotent', () => {
    const { store, close } = createStoreStub()
    const createStore = vi.fn(() => store)
    const service = new OrchestrationLedgerService(PROFILE_DIRECTORY, { createStore })

    service.close()
    service.close()

    expect(service.getState()).toBe('closed')
    expect(createStore).not.toHaveBeenCalled()
    expect(close).not.toHaveBeenCalled()
    expect(() => service.getLatestSequence()).toThrow('service is closed')
  })

  it('closes an opened store exactly once and rejects later operations', () => {
    const { store, close } = createStoreStub()
    const service = new OrchestrationLedgerService(PROFILE_DIRECTORY, {
      createStore: () => store
    })
    service.getSchemaVersion()

    service.close()
    service.close()

    expect(close).toHaveBeenCalledTimes(1)
    expect(service.getState()).toBe('closed')
    expect(() => service.readAfter()).toThrow('service is closed')
  })

  it('stays idle after a store factory failure so an explicit retry can succeed', () => {
    const { store } = createStoreStub()
    const createStore = vi
      .fn<() => OrchestrationLedgerStore>()
      .mockImplementationOnce(() => {
        throw new Error('temporary ledger open failure')
      })
      .mockImplementationOnce(() => store)
    const service = new OrchestrationLedgerService(PROFILE_DIRECTORY, { createStore })

    expect(() => service.getLatestSequence()).toThrow('temporary ledger open failure')
    expect(service.getState()).toBe('idle')

    expect(service.getLatestSequence()).toBe(0)
    expect(service.getState()).toBe('open')
    expect(createStore).toHaveBeenCalledTimes(2)
  })
})
