import { OrchestrationLedgerWorkerClient } from './orchestration-ledger-worker-client'
import { createOrchestrationLedgerWorkerFactory } from './orchestration-ledger-worker-factory'

export const ORCHESTRATION_LEDGER_GRACEFUL_CLOSE_TIMEOUT_MS = 3_000

export type OrchestrationLedgerRuntimeOwnerState = 'idle' | 'ready' | 'closing' | 'closed'

export type OrchestrationLedgerShutdownReport = {
  outcome: 'unused' | 'closed' | 'disposed'
  graceful: boolean
  timedOut: boolean
  error?: string
}

export type OrchestrationLedgerRuntimeClient = {
  close(): Promise<void>
  dispose(reason?: string): void
}

export type OrchestrationLedgerRuntimeOwnerDependencies<
  TClient extends OrchestrationLedgerRuntimeClient
> = {
  createClient?: (profileStorageDirectory: string) => TClient
  closeTimeoutMs?: number
  setTimer?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void
}

/**
 * Lifecycle owner for the asynchronous worker-backed Code Fusion Orchestration Ledger.
 *
 * Construction is side-effect free. The worker client is created only when a consumer asks for it,
 * and the client's worker remains lazy until the first ledger operation. Shutdown is bounded: a
 * graceful worker/SQLite close is attempted first, then fail-closed disposal prevents a wedged
 * worker from holding Electron teardown indefinitely.
 *
 * This class deliberately has no Electron imports and installs no app lifecycle listeners. Mounting
 * it into before-quit / will-quit is a separate integration and runtime-certification gate.
 */
export class OrchestrationLedgerRuntimeOwner<
  TClient extends OrchestrationLedgerRuntimeClient = OrchestrationLedgerWorkerClient
> {
  private readonly profileStorageDirectory: string
  private readonly createClient: (profileStorageDirectory: string) => TClient
  private readonly closeTimeoutMs: number
  private readonly setTimer: (
    callback: () => void,
    delayMs: number
  ) => ReturnType<typeof setTimeout>
  private readonly clearTimer: (timer: ReturnType<typeof setTimeout>) => void
  private client: TClient | null = null
  private state: OrchestrationLedgerRuntimeOwnerState = 'idle'
  private shutdownPromise: Promise<OrchestrationLedgerShutdownReport> | null = null
  private shutdownReport: OrchestrationLedgerShutdownReport | null = null

  constructor(
    profileStorageDirectory: string,
    dependencies: OrchestrationLedgerRuntimeOwnerDependencies<TClient> = {}
  ) {
    const normalizedDirectory = profileStorageDirectory.trim()
    if (!normalizedDirectory) {
      throw new Error('Code Fusion orchestration ledger profile directory cannot be empty')
    }

    const closeTimeoutMs =
      dependencies.closeTimeoutMs ?? ORCHESTRATION_LEDGER_GRACEFUL_CLOSE_TIMEOUT_MS
    if (!Number.isFinite(closeTimeoutMs) || closeTimeoutMs <= 0) {
      throw new Error('Code Fusion orchestration ledger close timeout must be positive and finite')
    }

    this.profileStorageDirectory = normalizedDirectory
    this.createClient =
      dependencies.createClient ??
      ((directory) =>
        new OrchestrationLedgerWorkerClient({
          profileStorageDirectory: directory,
          workerFactory: createOrchestrationLedgerWorkerFactory()
        }) as TClient)
    this.closeTimeoutMs = closeTimeoutMs
    this.setTimer = dependencies.setTimer ?? setTimeout
    this.clearTimer = dependencies.clearTimer ?? clearTimeout
  }

  getState(): OrchestrationLedgerRuntimeOwnerState {
    return this.state
  }

  isInitialized(): boolean {
    return this.client !== null
  }

  getClient(): TClient {
    if (this.state === 'closing' || this.state === 'closed') {
      throw new Error('Code Fusion orchestration ledger runtime owner is closed')
    }
    if (this.client) return this.client

    // Keep the owner idle if construction fails so a later explicit access can retry.
    const client = this.createClient(this.profileStorageDirectory)
    this.client = client
    this.state = 'ready'
    return client
  }

  /**
   * Attempt graceful worker/SQLite close within a strict deadline, then dispose on timeout/failure.
   * Repeated calls share one in-flight promise and later calls return the recorded result.
   */
  shutdown(): Promise<OrchestrationLedgerShutdownReport> {
    if (this.shutdownReport) return Promise.resolve(this.shutdownReport)
    if (this.shutdownPromise) return this.shutdownPromise

    const client = this.client
    if (!client) {
      const report: OrchestrationLedgerShutdownReport = {
        outcome: 'unused',
        graceful: true,
        timedOut: false
      }
      this.state = 'closed'
      this.shutdownReport = report
      return Promise.resolve(report)
    }

    this.state = 'closing'
    this.shutdownPromise = this.closeWithDeadline(client).then((report) => {
      this.client = null
      this.state = 'closed'
      this.shutdownReport = report
      this.shutdownPromise = null
      return report
    })
    return this.shutdownPromise
  }

  /** Immediate non-durable fallback for fatal teardown paths. */
  dispose(reason = 'Code Fusion orchestration ledger runtime owner was disposed'): void {
    if (this.state === 'closed') return
    const client = this.client
    this.client = null
    this.state = 'closed'
    this.shutdownReport = {
      outcome: client ? 'disposed' : 'unused',
      graceful: !client,
      timedOut: false,
      ...(client ? { error: sanitizeLifecycleError(reason) } : {})
    }
    client?.dispose(reason)
  }

  private closeWithDeadline(client: TClient): Promise<OrchestrationLedgerShutdownReport> {
    return new Promise((resolve) => {
      let settled = false
      let timer: ReturnType<typeof setTimeout> | null = null
      const finish = (report: OrchestrationLedgerShutdownReport): void => {
        if (settled) return
        settled = true
        if (timer) this.clearTimer(timer)
        resolve(report)
      }

      timer = this.setTimer(() => {
        const reason =
          `Code Fusion orchestration ledger graceful close exceeded ${this.closeTimeoutMs}ms`
        client.dispose(reason)
        finish({
          outcome: 'disposed',
          graceful: false,
          timedOut: true,
          error: reason
        })
      }, this.closeTimeoutMs)
      timer.unref?.()

      Promise.resolve()
        .then(() => client.close())
        .then(() =>
          finish({
            outcome: 'closed',
            graceful: true,
            timedOut: false
          })
        )
        .catch((error: unknown) => {
          const message = sanitizeLifecycleError(error)
          client.dispose(message)
          finish({
            outcome: 'disposed',
            graceful: false,
            timedOut: false,
            error: message
          })
        })
    })
  }
}

function sanitizeLifecycleError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  const normalized = raw.trim() || 'Code Fusion orchestration ledger shutdown failed'
  return normalized
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/((?:api[_-]?key|token|authorization)=)[^&\s]+/gi, '$1[redacted]')
}
