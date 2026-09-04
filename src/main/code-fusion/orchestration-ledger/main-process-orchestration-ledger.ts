import {
  OrchestrationLedgerRuntimeRegistry,
  type OrchestrationLedgerProfileShutdownReport,
  type OrchestrationLedgerRegistryShutdownReport
} from './orchestration-ledger-runtime-registry'
import type { OrchestrationLedgerRuntimeClient } from './orchestration-ledger-runtime-owner'
import type { OrchestrationLedgerWorkerClient } from './orchestration-ledger-worker-client'

export type MainProcessOrchestrationLedgerState = 'idle' | 'ready' | 'closing' | 'closed'

export type MainProcessOrchestrationLedgerProfileContext = {
  profile: {
    id: string
  }
  profileDirectory: string
}

export type MainProcessOrchestrationLedgerRegistryPort<
  TClient extends OrchestrationLedgerRuntimeClient
> = {
  getClient(profileId: string, profileStorageDirectory: string): TClient
  release(profileId: string): Promise<OrchestrationLedgerProfileShutdownReport | null>
  shutdownAll(): Promise<OrchestrationLedgerRegistryShutdownReport>
  disposeAll(reason?: string): OrchestrationLedgerRegistryShutdownReport
}

export type MainProcessOrchestrationLedgerDependencies<
  TClient extends OrchestrationLedgerRuntimeClient
> = {
  createRegistry?: () => MainProcessOrchestrationLedgerRegistryPort<TClient>
}

/**
 * Dormant main-process composition seam for the Code Fusion Orchestration Ledger.
 *
 * Construction creates no registry, owner, worker, or SQLite sidecar. A consumer must explicitly
 * request a profile client before the worker path can become active, and even then the worker client
 * remains lazy until its first real ledger operation. This class intentionally imports no Electron
 * APIs and installs no lifecycle listeners; startup/profile-switch/quit mounting remains a separate
 * reviewed gate.
 */
export class MainProcessOrchestrationLedgerController<
  TClient extends OrchestrationLedgerRuntimeClient = OrchestrationLedgerWorkerClient
> {
  private readonly createRegistry: () => MainProcessOrchestrationLedgerRegistryPort<TClient>
  private registry: MainProcessOrchestrationLedgerRegistryPort<TClient> | null = null
  private state: MainProcessOrchestrationLedgerState = 'idle'
  private shutdownPromise: Promise<OrchestrationLedgerRegistryShutdownReport> | null = null
  private shutdownReport: OrchestrationLedgerRegistryShutdownReport | null = null

  constructor(dependencies: MainProcessOrchestrationLedgerDependencies<TClient> = {}) {
    this.createRegistry =
      dependencies.createRegistry ??
      (() =>
        new OrchestrationLedgerRuntimeRegistry<TClient>() as MainProcessOrchestrationLedgerRegistryPort<TClient>)
  }

  getState(): MainProcessOrchestrationLedgerState {
    return this.state
  }

  isInitialized(): boolean {
    return this.registry !== null
  }

  ensureRegistry(): MainProcessOrchestrationLedgerRegistryPort<TClient> {
    this.assertOpen()
    if (this.registry) return this.registry

    // Keep state idle if construction fails so corrected configuration can be retried explicitly.
    const registry = this.createRegistry()
    this.registry = registry
    this.state = 'ready'
    return registry
  }

  getProfileClient(profile: MainProcessOrchestrationLedgerProfileContext): TClient {
    const profileId = normalizeProfileId(profile.profile.id)
    const profileDirectory = normalizeProfileDirectory(profile.profileDirectory)
    return this.ensureRegistry().getClient(profileId, profileDirectory)
  }

  getActiveProfileClient(
    activeProfile: MainProcessOrchestrationLedgerProfileContext | null
  ): TClient {
    if (!activeProfile) {
      throw new Error('Code Fusion active profile is unavailable for the orchestration ledger')
    }
    return this.getProfileClient(activeProfile)
  }

  releaseProfile(
    profileId: string
  ): Promise<OrchestrationLedgerProfileShutdownReport | null> {
    this.assertOpen()
    const registry = this.registry
    if (!registry) return Promise.resolve(null)
    return registry.release(normalizeProfileId(profileId))
  }

  /**
   * Close every initialized profile runtime. Repeated calls share one in-flight operation and later
   * calls return the recorded evidence without recreating the registry.
   */
  shutdownAll(): Promise<OrchestrationLedgerRegistryShutdownReport> {
    if (this.shutdownReport) return Promise.resolve(this.shutdownReport)
    if (this.shutdownPromise) return this.shutdownPromise

    const registry = this.registry
    if (!registry) {
      const report: OrchestrationLedgerRegistryShutdownReport = {
        outcome: 'unused',
        profiles: []
      }
      this.state = 'closed'
      this.shutdownReport = report
      return Promise.resolve(report)
    }

    this.state = 'closing'
    this.shutdownPromise = Promise.resolve()
      .then(() => registry.shutdownAll())
      .catch((error: unknown) => registry.disposeAll(sanitizeCompositionError(error)))
      .then((report) => {
        // Fatal disposal may have recorded the final evidence while graceful shutdown was in flight.
        const finalReport = this.shutdownReport ?? report
        // Only clear the registry this operation owns; a future implementation must never erase a
        // replacement installed by a different composition generation.
        if (this.registry === registry) this.registry = null
        this.state = 'closed'
        this.shutdownReport = finalReport
        this.shutdownPromise = null
        return finalReport
      })
    return this.shutdownPromise
  }

  /** Immediate non-durable fallback for fatal process teardown. */
  disposeAll(
    reason = 'Code Fusion main-process orchestration ledger was disposed'
  ): OrchestrationLedgerRegistryShutdownReport {
    if (this.shutdownReport) return this.shutdownReport

    const registry = this.registry
    this.registry = null
    this.state = 'closed'
    const report = registry
      ? registry.disposeAll(sanitizeCompositionError(reason))
      : ({ outcome: 'unused', profiles: [] } satisfies OrchestrationLedgerRegistryShutdownReport)
    this.shutdownReport = report
    return report
  }

  private assertOpen(): void {
    if (this.state === 'closing' || this.state === 'closed') {
      throw new Error('Code Fusion main-process orchestration ledger is closed')
    }
  }
}

/**
 * Process-wide dormant controller. Importing this symbol allocates only the controller object; it
 * does not create a registry, worker client, worker thread, SQLite connection, or sidecar file.
 */
export const mainProcessOrchestrationLedger =
  new MainProcessOrchestrationLedgerController()

function normalizeProfileId(value: string): string {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error('Code Fusion orchestration ledger profile ID cannot be empty')
  }
  return normalized
}

function normalizeProfileDirectory(value: string): string {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error('Code Fusion orchestration ledger profile directory cannot be empty')
  }
  return normalized
}

function sanitizeCompositionError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  const normalized = raw.trim() || 'Code Fusion orchestration ledger shutdown failed'
  return normalized
    .slice(0, 1_000)
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/((?:api[_-]?key|token|authorization)=)[^&\s]+/gi, '$1[redacted]')
}
