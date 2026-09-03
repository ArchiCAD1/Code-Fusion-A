import type {
  OrchestrationLedgerAggregateType,
  OrchestrationLedgerReadOptions,
  OrchestrationLedgerRecord,
  OrchestrationLedgerStore
} from '../../../shared/code-fusion/orchestration-ledger'
import {
  createCoreOrchestrationLedgerEvent,
  type CoreOrchestrationLedgerEventInput
} from '../../../shared/code-fusion/orchestration-ledger-core-events'
import { resolveCodeFusionLedgerPath } from './ledger-path'
import { SqliteOrchestrationLedgerStore } from './sqlite-ledger-store'

export type OrchestrationLedgerServiceState = 'idle' | 'open' | 'closed'

export type OrchestrationLedgerStoreFactory = (path: string) => OrchestrationLedgerStore

export type OrchestrationLedgerServiceDependencies = {
  createStore?: OrchestrationLedgerStoreFactory
}

/**
 * Bounded main-process owner for the Code Fusion Orchestration Ledger.
 *
 * Construction is deliberately side-effect free: the SQLite file is not opened until the first
 * read/write operation. This lets startup own the service lifecycle without creating durable state
 * before a real ledger consumer exists, and gives us a seam for moving storage work off the main
 * thread later without changing callers.
 */
export class OrchestrationLedgerService {
  private readonly ledgerPath: string
  private readonly createStore: OrchestrationLedgerStoreFactory
  private store: OrchestrationLedgerStore | null = null
  private serviceState: OrchestrationLedgerServiceState = 'idle'

  constructor(
    profileStorageDirectory: string,
    dependencies: OrchestrationLedgerServiceDependencies = {}
  ) {
    this.ledgerPath = resolveCodeFusionLedgerPath(profileStorageDirectory)
    this.createStore =
      dependencies.createStore ?? ((path) => new SqliteOrchestrationLedgerStore(path))
  }

  getState(): OrchestrationLedgerServiceState {
    return this.serviceState
  }

  getStoragePath(): string {
    return this.ledgerPath
  }

  getSchemaVersion(): number {
    return this.requireStore().getSchemaVersion()
  }

  getLatestSequence(): number {
    return this.requireStore().getLatestSequence()
  }

  appendCore(event: CoreOrchestrationLedgerEventInput): OrchestrationLedgerRecord {
    return this.requireStore().append(createCoreOrchestrationLedgerEvent(event))
  }

  appendCoreMany(
    events: readonly CoreOrchestrationLedgerEventInput[]
  ): readonly OrchestrationLedgerRecord[] {
    if (events.length === 0) return []
    return this.requireStore().appendMany(events.map(createCoreOrchestrationLedgerEvent))
  }

  readAfter(options?: OrchestrationLedgerReadOptions): readonly OrchestrationLedgerRecord[] {
    return this.requireStore().readAfter(options)
  }

  readAggregate(
    aggregateType: OrchestrationLedgerAggregateType,
    aggregateId: string,
    options?: OrchestrationLedgerReadOptions
  ): readonly OrchestrationLedgerRecord[] {
    return this.requireStore().readAggregate(aggregateType, aggregateId, options)
  }

  readProject(
    projectId: string,
    options?: OrchestrationLedgerReadOptions
  ): readonly OrchestrationLedgerRecord[] {
    return this.requireStore().readProject(projectId, options)
  }

  close(): void {
    if (this.serviceState === 'closed') return
    const store = this.store
    this.store = null
    this.serviceState = 'closed'
    store?.close()
  }

  private requireStore(): OrchestrationLedgerStore {
    if (this.serviceState === 'closed') {
      throw new Error('Code Fusion orchestration ledger service is closed')
    }
    if (this.store) return this.store

    // Keep state idle if creation fails so a transient open error can be retried explicitly.
    const store = this.createStore(this.ledgerPath)
    this.store = store
    this.serviceState = 'open'
    return store
  }
}
