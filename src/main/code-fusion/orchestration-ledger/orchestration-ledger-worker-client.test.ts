import type { Worker } from 'node:worker_threads'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  OrchestrationLedgerWorkerClient,
  OrchestrationLedgerWorkerTimeoutError,
  OrchestrationLedgerWorkerUnavailableError
} from './orchestration-ledger-worker-client'
import {
  ORCHESTRATION_LEDGER_WORKER_MAX_PENDING_REQUESTS,
  ORCHESTRATION_LEDGER_WORKER_PROTOCOL_VERSION,
  ORCHESTRATION_LEDGER_WORKER_REQUEST_TIMEOUT_MS,
  type OrchestrationLedgerWorkerRequest
} from './orchestration-ledger-worker-protocol'

class FakeWorker {
  readonly postedRequests: OrchestrationLedgerWorkerRequest[] = []
  terminated = false
  private readonly listeners = new Map<string, Set<(arg?: unknown) => void>>()

  on(event: string, listener: (arg?: unknown) => void): this {
    const current = this.listeners.get(event) ?? new Set()
    current.add(listener)
    this.listeners.set(event, current)
    return this
  }

  off(event: string, listener: (arg?: unknown) => void): this {
    this.listeners.get(event)?.delete(listener)
    return this
  }

  removeAllListeners(): this {
    this.listeners.clear()
    return this
  }

  unref(): this {
    return this
  }

  async terminate(): Promise<number> {
    this.terminated = true
    return 1
  }

  postMessage(request: OrchestrationLedgerWorkerRequest): void {
    this.postedRequests.push(request)
  }

  emit(event: string, arg?: unknown): void {
    for (const listener of Array.from(this.listeners.get(event) ?? [])) listener(arg)
  }

  respond(result: unknown): void {
    const request = this.postedRequests.at(-1)
    if (!request) throw new Error('no request posted')
    this.emit('message', {
      protocolVersion: ORCHESTRATION_LEDGER_WORKER_PROTOCOL_VERSION,
      id: request.id,
      operation: request.operation,
      ok: true,
      result
    })
  }

  reject(message: string): void {
    const request = this.postedRequests.at(-1)
    if (!request) throw new Error('no request posted')
    this.emit('message', {
      protocolVersion: ORCHESTRATION_LEDGER_WORKER_PROTOCOL_VERSION,
      id: request.id,
      operation: request.operation,
      ok: false,
      error: { name: 'Error', message }
    })
  }
}

function makeClient(workers: FakeWorker[]): OrchestrationLedgerWorkerClient {
  return new OrchestrationLedgerWorkerClient({
    profileStorageDirectory: '/tmp/profile',
    workerFactory: () => {
      const worker = new FakeWorker()
      workers.push(worker)
      return worker as unknown as Worker
    },
    log() {}
  })
}

describe('OrchestrationLedgerWorkerClient', () => {
  afterEach(() => vi.useRealTimers())

  it('is lazy and dispatches requests FIFO', async () => {
    const workers: FakeWorker[] = []
    const client = makeClient(workers)
    expect(client.getState()).toBe('idle')
    expect(workers).toHaveLength(0)

    const first = client.getSchemaVersion()
    const second = client.getLatestSequence()
    expect(workers).toHaveLength(1)
    expect(workers[0].postedRequests.map((request) => request.operation)).toEqual([
      'getSchemaVersion'
    ])

    workers[0].respond(1)
    await expect(first).resolves.toBe(1)
    expect(workers[0].postedRequests.map((request) => request.operation)).toEqual([
      'getSchemaVersion',
      'getLatestSequence'
    ])
    workers[0].respond(9)
    await expect(second).resolves.toBe(9)
  })

  it('does not start a worker for an empty batch or an idle close', async () => {
    const workers: FakeWorker[] = []
    const client = makeClient(workers)

    await expect(client.appendCoreMany([])).resolves.toEqual([])
    await expect(client.close()).resolves.toBeUndefined()
    expect(workers).toHaveLength(0)
    expect(client.getState()).toBe('closed')
  })

  it('drains accepted work and closes SQLite in the worker', async () => {
    const workers: FakeWorker[] = []
    const client = makeClient(workers)
    const read = client.getLatestSequence()
    const close = client.close()

    workers[0].respond(4)
    await expect(read).resolves.toBe(4)
    expect(workers[0].postedRequests.at(-1)?.operation).toBe('close')
    workers[0].respond(null)
    await expect(close).resolves.toBeUndefined()
    expect(client.getState()).toBe('closed')
    expect(workers[0].terminated).toBe(true)
  })

  it('reconstructs worker-side errors without losing their code', async () => {
    const workers: FakeWorker[] = []
    const client = makeClient(workers)
    const pending = client.readProject('project-1')
    const request = workers[0].postedRequests.at(-1)
    if (!request) throw new Error('request not dispatched')

    workers[0].emit('message', {
      protocolVersion: ORCHESTRATION_LEDGER_WORKER_PROTOCOL_VERSION,
      id: request.id,
      operation: request.operation,
      ok: false,
      error: { name: 'LedgerBusyError', message: 'busy', code: 'SQLITE_BUSY' }
    })

    const error = await pending.catch((value: unknown) => value)
    expect(error).toMatchObject({ name: 'LedgerBusyError', message: 'busy', code: 'SQLITE_BUSY' })
  })

  it('rejects active and queued requests on a worker fault without replay', async () => {
    const workers: FakeWorker[] = []
    const client = makeClient(workers)
    const first = client.getLatestSequence().catch((error: unknown) => error)
    const second = client.readProject('project-1').catch((error: unknown) => error)

    workers[0].emit('error', new Error('worker failed'))
    await expect(first).resolves.toMatchObject({ message: 'worker failed' })
    await expect(second).resolves.toMatchObject({ message: 'worker failed' })
    expect(workers[0].terminated).toBe(true)

    const retry = client.getLatestSequence()
    expect(workers).toHaveLength(2)
    workers[1].respond(5)
    await expect(retry).resolves.toBe(5)
  })

  it('times out a stalled worker and rejects the queue', async () => {
    vi.useFakeTimers()
    const workers: FakeWorker[] = []
    const client = makeClient(workers)
    const active = client.getLatestSequence().catch((error: unknown) => error)
    const queued = client.readAfter().catch((error: unknown) => error)

    await vi.advanceTimersByTimeAsync(ORCHESTRATION_LEDGER_WORKER_REQUEST_TIMEOUT_MS)
    await expect(active).resolves.toBeInstanceOf(OrchestrationLedgerWorkerTimeoutError)
    await expect(queued).resolves.toBeInstanceOf(OrchestrationLedgerWorkerTimeoutError)
    expect(workers[0].terminated).toBe(true)
  })

  it('fails closed when the worker cannot be started', async () => {
    const client = new OrchestrationLedgerWorkerClient({
      profileStorageDirectory: '/tmp/profile',
      workerFactory: () => {
        throw new Error('worker missing')
      },
      log() {}
    })

    await expect(client.getSchemaVersion()).rejects.toBeInstanceOf(
      OrchestrationLedgerWorkerUnavailableError
    )
  })

  it('bounds active plus queued requests', async () => {
    const workers: FakeWorker[] = []
    const client = makeClient(workers)
    const accepted = Array.from(
      { length: ORCHESTRATION_LEDGER_WORKER_MAX_PENDING_REQUESTS },
      () => client.getLatestSequence().catch((error: unknown) => error)
    )

    await expect(client.getLatestSequence()).rejects.toThrow('queue is full')
    client.dispose()
    await Promise.all(accepted)
  })
})
