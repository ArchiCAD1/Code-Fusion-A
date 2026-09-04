import type { Worker } from 'node:worker_threads'
import type {
  OrchestrationLedgerAggregateType,
  OrchestrationLedgerReadOptions,
  OrchestrationLedgerRecord
} from '../../../shared/code-fusion/orchestration-ledger'
import type { CoreOrchestrationLedgerEventInput } from '../../../shared/code-fusion/orchestration-ledger-core-events'
import {
  ORCHESTRATION_LEDGER_WORKER_MAX_PENDING_REQUESTS,
  ORCHESTRATION_LEDGER_WORKER_PROTOCOL_VERSION,
  ORCHESTRATION_LEDGER_WORKER_REQUEST_TIMEOUT_MS,
  isOrchestrationLedgerWorkerResponse,
  type OrchestrationLedgerWorkerOperation,
  type OrchestrationLedgerWorkerRequest
} from './orchestration-ledger-worker-protocol'

export type OrchestrationLedgerWorkerClientState = 'idle' | 'open' | 'closing' | 'closed'
export type OrchestrationLedgerWorkerFactory = (profileStorageDirectory: string) => Worker

export class OrchestrationLedgerWorkerUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OrchestrationLedgerWorkerUnavailableError'
  }
}

export class OrchestrationLedgerWorkerTimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OrchestrationLedgerWorkerTimeoutError'
  }
}

export class OrchestrationLedgerWorkerProtocolError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OrchestrationLedgerWorkerProtocolError'
  }
}

type PendingRequest = {
  request: OrchestrationLedgerWorkerRequest
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout | null
}

/**
 * Asynchronous main-process facade for the worker-owned SQLite ledger.
 *
 * Requests run FIFO so only one synchronous SQLite operation executes at a time. A worker fault
 * rejects the active and queued requests without replay; callers must decide whether an uncertain
 * write is safe to retry. This class deliberately requires an injected worker factory. Resolving
 * and packaging the built worker entry is a separate integration gate.
 */
export class OrchestrationLedgerWorkerClient {
  private readonly profileStorageDirectory: string
  private readonly workerFactory: OrchestrationLedgerWorkerFactory
  private readonly log: (message: string) => void
  private worker: Worker | null = null
  private active: PendingRequest | null = null
  private queue: PendingRequest[] = []
  private nextId = 1
  private state: OrchestrationLedgerWorkerClientState = 'idle'
  private cleanupWorkerListeners: (() => void) | null = null
  private closePromise: Promise<void> | null = null

  constructor(options: {
    profileStorageDirectory: string
    workerFactory: OrchestrationLedgerWorkerFactory
    log?: (message: string) => void
  }) {
    if (!options.profileStorageDirectory.trim()) {
      throw new Error('Code Fusion orchestration ledger profile directory cannot be empty')
    }
    this.profileStorageDirectory = options.profileStorageDirectory.trim()
    this.workerFactory = options.workerFactory
    this.log = options.log ?? ((message) => console.warn(message))
  }

  getState(): OrchestrationLedgerWorkerClientState {
    return this.state
  }

  getSchemaVersion(): Promise<number> {
    return this.enqueue('getSchemaVersion', null) as Promise<number>
  }

  getLatestSequence(): Promise<number> {
    return this.enqueue('getLatestSequence', null) as Promise<number>
  }

  appendCore(event: CoreOrchestrationLedgerEventInput): Promise<OrchestrationLedgerRecord> {
    return this.enqueue('appendCore', { event }) as Promise<OrchestrationLedgerRecord>
  }

  appendCoreMany(
    events: readonly CoreOrchestrationLedgerEventInput[]
  ): Promise<readonly OrchestrationLedgerRecord[]> {
    if (events.length === 0) return Promise.resolve([])
    return this.enqueue('appendCoreMany', { events }) as Promise<readonly OrchestrationLedgerRecord[]>
  }

  readAfter(options?: OrchestrationLedgerReadOptions): Promise<readonly OrchestrationLedgerRecord[]> {
    return this.enqueue('readAfter', { options }) as Promise<readonly OrchestrationLedgerRecord[]>
  }

  readAggregate(
    aggregateType: OrchestrationLedgerAggregateType,
    aggregateId: string,
    options?: OrchestrationLedgerReadOptions
  ): Promise<readonly OrchestrationLedgerRecord[]> {
    return this.enqueue('readAggregate', { aggregateType, aggregateId, options }) as Promise<
      readonly OrchestrationLedgerRecord[]
    >
  }

  readProject(
    projectId: string,
    options?: OrchestrationLedgerReadOptions
  ): Promise<readonly OrchestrationLedgerRecord[]> {
    return this.enqueue('readProject', { projectId, options }) as Promise<
      readonly OrchestrationLedgerRecord[]
    >
  }

  /**
   * Drain accepted work, close SQLite on the worker, then terminate it. Closing an unused client
   * does not spawn a worker or create the ledger sidecar.
   */
  close(): Promise<void> {
    if (this.state === 'closed') return Promise.resolve()
    if (this.closePromise) return this.closePromise

    this.state = 'closing'
    if (!this.worker && !this.active && this.queue.length === 0) {
      this.state = 'closed'
      return Promise.resolve()
    }

    this.closePromise = new Promise<void>((resolve, reject) => {
      this.queue.push({
        request: this.createRequest('close', null),
        resolve: () => resolve(),
        reject,
        timer: null
      })
      this.pump()
    }).finally(() => {
      this.state = 'closed'
      this.destroyWorker()
      this.closePromise = null
    })
    return this.closePromise
  }

  /** Reject pending work and terminate immediately. This is a final fallback, not a durable close. */
  dispose(reason = 'Code Fusion orchestration ledger worker was disposed'): void {
    if (this.state === 'closed') return
    this.state = 'closed'
    this.rejectAll(new Error(reason))
    this.destroyWorker()
  }

  private enqueue(
    operation: Exclude<OrchestrationLedgerWorkerOperation, 'close'>,
    payload: OrchestrationLedgerWorkerRequest['payload']
  ): Promise<unknown> {
    if (this.state === 'closing' || this.state === 'closed') {
      return Promise.reject(new Error('Code Fusion orchestration ledger worker client is closed'))
    }
    const pendingCount = this.queue.length + (this.active ? 1 : 0)
    if (pendingCount >= ORCHESTRATION_LEDGER_WORKER_MAX_PENDING_REQUESTS) {
      return Promise.reject(new Error('Code Fusion orchestration ledger worker queue is full'))
    }

    return new Promise((resolve, reject) => {
      this.queue.push({
        request: this.createRequest(operation, payload),
        resolve,
        reject,
        timer: null
      })
      this.pump()
    })
  }

  private createRequest(
    operation: OrchestrationLedgerWorkerOperation,
    payload: OrchestrationLedgerWorkerRequest['payload']
  ): OrchestrationLedgerWorkerRequest {
    return {
      protocolVersion: ORCHESTRATION_LEDGER_WORKER_PROTOCOL_VERSION,
      id: this.nextId++,
      operation,
      payload
    } as OrchestrationLedgerWorkerRequest
  }

  private pump(): void {
    if (this.active || this.queue.length === 0 || this.state === 'closed') return
    const worker = this.ensureWorker()
    if (!worker) {
      this.rejectAll(
        new OrchestrationLedgerWorkerUnavailableError(
          'Code Fusion orchestration ledger worker could not be started'
        )
      )
      return
    }
    const next = this.queue.shift()
    if (!next) return

    this.active = next
    next.timer = setTimeout(
      () => this.onRequestTimeout(next),
      ORCHESTRATION_LEDGER_WORKER_REQUEST_TIMEOUT_MS
    )
    next.timer.unref?.()
    try {
      worker.postMessage(next.request)
    } catch (error) {
      this.onWorkerFault(toError(error))
    }
  }

  private ensureWorker(): Worker | null {
    if (this.worker) return this.worker
    try {
      const worker = this.workerFactory(this.profileStorageDirectory)
      const onMessage = (response: unknown): void => this.onMessage(response)
      const onError = (error: Error): void => this.onWorkerFault(error)
      const onExit = (code: number): void => this.onWorkerExit(code)
      worker.on('message', onMessage)
      worker.on('error', onError)
      worker.on('exit', onExit)
      this.cleanupWorkerListeners = () => {
        worker.off('message', onMessage)
        worker.off('error', onError)
        worker.off('exit', onExit)
      }
      worker.unref?.()
      this.worker = worker
      if (this.state === 'idle') this.state = 'open'
      return worker
    } catch (error) {
      this.log(`[code-fusion-ledger] worker unavailable: ${errorMessage(error)}`)
      return null
    }
  }

  private onMessage(value: unknown): void {
    const pending = this.active
    if (!pending) return

    if (!isOrchestrationLedgerWorkerResponse(value)) {
      if (matchesPendingResponseEnvelope(value, pending.request)) {
        this.onWorkerFault(
          new OrchestrationLedgerWorkerProtocolError(
            `Code Fusion orchestration ledger worker returned an invalid ${pending.request.operation} response`
          )
        )
      }
      return
    }
    if (pending.request.id !== value.id || pending.request.operation !== value.operation) {
      return
    }

    this.settleActive()
    if (value.ok) {
      pending.resolve(value.result)
    } else {
      const error = new Error(value.error.message)
      error.name = value.error.name
      if (value.error.code) (error as Error & { code?: string }).code = value.error.code
      pending.reject(error)
    }
    this.pump()
  }

  private onRequestTimeout(pending: PendingRequest): void {
    if (this.active !== pending) return
    this.onWorkerFault(
      new OrchestrationLedgerWorkerTimeoutError(
        `Code Fusion orchestration ledger worker timed out during ${pending.request.operation}`
      )
    )
  }

  private onWorkerExit(code: number): void {
    if (code === 0 && !this.active && this.queue.length === 0) {
      this.destroyWorker()
      return
    }
    this.onWorkerFault(new Error(`Code Fusion orchestration ledger worker exited with code ${code}`))
  }

  private onWorkerFault(error: Error): void {
    this.destroyWorker()
    this.rejectAll(error)
    if (this.state !== 'closing' && this.state !== 'closed') this.state = 'idle'
  }

  private settleActive(): PendingRequest | null {
    const pending = this.active
    this.active = null
    if (pending?.timer) {
      clearTimeout(pending.timer)
      pending.timer = null
    }
    return pending
  }

  private rejectAll(error: Error): void {
    const active = this.settleActive()
    active?.reject(error)
    const queued = this.queue
    this.queue = []
    for (const pending of queued) pending.reject(error)
  }

  private destroyWorker(): void {
    const worker = this.worker
    this.worker = null
    if (!worker) return
    this.cleanupWorkerListeners?.()
    this.cleanupWorkerListeners = null
    worker.removeAllListeners()
    void worker.terminate().catch(() => undefined)
  }
}

function matchesPendingResponseEnvelope(
  value: unknown,
  request: OrchestrationLedgerWorkerRequest
): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  return candidate.id === request.id && candidate.operation === request.operation
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
