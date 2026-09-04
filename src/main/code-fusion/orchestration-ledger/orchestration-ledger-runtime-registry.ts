import { resolve } from 'node:path'
import {
  OrchestrationLedgerRuntimeOwner,
  type OrchestrationLedgerRuntimeClient,
  type OrchestrationLedgerShutdownReport
} from './orchestration-ledger-runtime-owner'
import type { OrchestrationLedgerWorkerClient } from './orchestration-ledger-worker-client'

export const ORCHESTRATION_LEDGER_MAX_PROFILE_RUNTIMES = 32
export const ORCHESTRATION_LEDGER_MAX_PROFILE_ID_LENGTH = 256
export const ORCHESTRATION_LEDGER_MAX_PROFILE_DIRECTORY_LENGTH = 4_096

export type OrchestrationLedgerRuntimeRegistryState =
  | 'idle'
  | 'active'
  | 'closing'
  | 'closed'

export type OrchestrationLedgerRuntimeOwnerPort<
  TClient extends OrchestrationLedgerRuntimeClient
> = {
  getClient(): TClient
  shutdown(): Promise<OrchestrationLedgerShutdownReport>
  dispose(reason?: string): void
}

export type OrchestrationLedgerProfileShutdownReport =
  OrchestrationLedgerShutdownReport & {
    profileId: string
  }

export type OrchestrationLedgerRegistryShutdownReport = {
  outcome: 'unused' | 'closed' | 'partial' | 'disposed'
  profiles: readonly OrchestrationLedgerProfileShutdownReport[]
}

export type OrchestrationLedgerRuntimeRegistryDependencies<
  TClient extends OrchestrationLedgerRuntimeClient,
  TOwner extends OrchestrationLedgerRuntimeOwnerPort<TClient>
> = {
  createOwner?: (profileStorageDirectory: string) => TOwner
  maxProfiles?: number
}

type RuntimeEntry<TOwner> = {
  profileStorageDirectory: string
  owner: TOwner
}

/**
 * Profile-scoped owner registry for worker-backed Code Fusion Orchestration Ledgers.
 *
 * Registry construction and owner creation remain side-effect free; no worker or SQLite sidecar is
 * created until a consumer asks an owner for its client and performs a real operation. A profile ID
 * is bound to one normalized storage directory while it is registered or closing, preventing
 * accidental cross-profile ledger reuse. Shutdown is aggregate, bounded by each owner's deadline,
 * and never introduces Electron or renderer dependencies.
 */
export class OrchestrationLedgerRuntimeRegistry<
  TClient extends OrchestrationLedgerRuntimeClient = OrchestrationLedgerWorkerClient,
  TOwner extends OrchestrationLedgerRuntimeOwnerPort<TClient> =
    OrchestrationLedgerRuntimeOwner<TClient>
> {
  private readonly createOwner: (profileStorageDirectory: string) => TOwner
  private readonly maxProfiles: number
  private readonly entries = new Map<string, RuntimeEntry<TOwner>>()
  private readonly releases = new Map<
    string,
    Promise<OrchestrationLedgerProfileShutdownReport | null>
  >()
  private state: OrchestrationLedgerRuntimeRegistryState = 'idle'
  private shutdownPromise: Promise<OrchestrationLedgerRegistryShutdownReport> | null = null
  private shutdownReport: OrchestrationLedgerRegistryShutdownReport | null = null

  constructor(
    dependencies: OrchestrationLedgerRuntimeRegistryDependencies<TClient, TOwner> = {}
  ) {
    const maxProfiles =
      dependencies.maxProfiles ?? ORCHESTRATION_LEDGER_MAX_PROFILE_RUNTIMES
    if (!Number.isSafeInteger(maxProfiles) || maxProfiles <= 0) {
      throw new Error(
        'Code Fusion orchestration ledger maximum profile count must be a positive safe integer'
      )
    }

    this.maxProfiles = maxProfiles
    this.createOwner =
      dependencies.createOwner ??
      ((directory) =>
        new OrchestrationLedgerRuntimeOwner<TClient>(directory) as unknown as TOwner)
  }

  getState(): OrchestrationLedgerRuntimeRegistryState {
    return this.state
  }

  get size(): number {
    return this.entries.size
  }

  listProfileIds(): readonly string[] {
    return Array.from(this.entries.keys()).sort()
  }

  getOrCreateOwner(profileId: string, profileStorageDirectory: string): TOwner {
    this.assertAcceptingProfiles()

    const normalizedProfileId = normalizeProfileId(profileId)
    const normalizedDirectory = normalizeProfileStorageDirectory(profileStorageDirectory)

    if (this.releases.has(normalizedProfileId)) {
      throw new Error(
        `Code Fusion orchestration ledger profile "${normalizedProfileId}" is closing`
      )
    }

    const existing = this.entries.get(normalizedProfileId)
    if (existing) {
      if (existing.profileStorageDirectory !== normalizedDirectory) {
        throw new Error(
          `Code Fusion orchestration ledger profile "${normalizedProfileId}" changed storage directory`
        )
      }
      return existing.owner
    }

    if (this.entries.size >= this.maxProfiles) {
      throw new Error(
        `Code Fusion orchestration ledger profile limit of ${this.maxProfiles} was reached`
      )
    }

    // Owner construction is required to remain side-effect free. If construction throws, no entry
    // is retained and callers may correct the configuration and retry.
    const owner = this.createOwner(normalizedDirectory)
    this.entries.set(normalizedProfileId, {
      profileStorageDirectory: normalizedDirectory,
      owner
    })
    this.state = 'active'
    return owner
  }

  getClient(profileId: string, profileStorageDirectory: string): TClient {
    return this.getOrCreateOwner(profileId, profileStorageDirectory).getClient()
  }

  /**
   * Gracefully release one profile. Duplicate calls share the same promise, and the profile cannot
   * be recreated until its prior owner has completed shutdown.
   */
  release(profileId: string): Promise<OrchestrationLedgerProfileShutdownReport | null> {
    if (this.state === 'closed') {
      return Promise.reject(
        new Error('Code Fusion orchestration ledger runtime registry is closed')
      )
    }
    return this.releaseInternal(normalizeProfileId(profileId))
  }

  /**
   * Close every registered profile. The owner-level deadline prevents a wedged worker from holding
   * this aggregate shutdown forever. Results are sorted by profile ID for deterministic evidence.
   */
  shutdownAll(): Promise<OrchestrationLedgerRegistryShutdownReport> {
    if (this.shutdownReport) return Promise.resolve(this.shutdownReport)
    if (this.shutdownPromise) return this.shutdownPromise

    this.state = 'closing'
    const profileIds = Array.from(
      new Set([...this.entries.keys(), ...this.releases.keys()])
    ).sort()

    if (profileIds.length === 0) {
      const report: OrchestrationLedgerRegistryShutdownReport = {
        outcome: 'unused',
        profiles: []
      }
      this.state = 'closed'
      this.shutdownReport = report
      return Promise.resolve(report)
    }

    this.shutdownPromise = Promise.all(
      profileIds.map((profileId) => this.releaseInternal(profileId))
    ).then((results) => {
      // Fatal disposal may have installed a final report while graceful shutdown was in flight.
      if (this.shutdownReport) return this.shutdownReport

      const profiles = results
        .filter(
          (report): report is OrchestrationLedgerProfileShutdownReport =>
            report !== null
        )
        .sort((left, right) => left.profileId.localeCompare(right.profileId))
      const report: OrchestrationLedgerRegistryShutdownReport = {
        outcome: profiles.every((profile) => profile.graceful) ? 'closed' : 'partial',
        profiles
      }
      this.entries.clear()
      this.releases.clear()
      this.state = 'closed'
      this.shutdownReport = report
      this.shutdownPromise = null
      return report
    })
    return this.shutdownPromise
  }

  /**
   * Immediate non-durable fallback for fatal teardown. This does not wait for SQLite close and must
   * not be represented as graceful shutdown evidence.
   */
  disposeAll(
    reason = 'Code Fusion orchestration ledger runtime registry was disposed'
  ): OrchestrationLedgerRegistryShutdownReport {
    if (this.shutdownReport) return this.shutdownReport

    const sanitizedReason = sanitizeRegistryError(reason)
    const profiles = Array.from(this.entries.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([profileId, entry]) => {
        entry.owner.dispose(sanitizedReason)
        return {
          profileId,
          outcome: 'disposed' as const,
          graceful: false,
          timedOut: false,
          error: sanitizedReason
        }
      })

    this.entries.clear()
    this.releases.clear()
    this.state = 'closed'
    this.shutdownReport = {
      outcome: profiles.length === 0 ? 'unused' : 'disposed',
      profiles
    }
    return this.shutdownReport
  }

  private releaseInternal(
    normalizedProfileId: string
  ): Promise<OrchestrationLedgerProfileShutdownReport | null> {
    const existingRelease = this.releases.get(normalizedProfileId)
    if (existingRelease) return existingRelease

    const entry = this.entries.get(normalizedProfileId)
    if (!entry) return Promise.resolve(null)

    const release = Promise.resolve()
      .then(() => entry.owner.shutdown())
      .then(
        (report): OrchestrationLedgerProfileShutdownReport => ({
          profileId: normalizedProfileId,
          ...report
        })
      )
      .catch((error: unknown): OrchestrationLedgerProfileShutdownReport => {
        const message = sanitizeRegistryError(error)
        entry.owner.dispose(message)
        return {
          profileId: normalizedProfileId,
          outcome: 'disposed',
          graceful: false,
          timedOut: false,
          error: message
        }
      })
      .finally(() => {
        this.entries.delete(normalizedProfileId)
        this.releases.delete(normalizedProfileId)
        if (this.state === 'active' && this.entries.size === 0) {
          this.state = 'idle'
        }
      })

    this.releases.set(normalizedProfileId, release)
    return release
  }

  private assertAcceptingProfiles(): void {
    if (this.state === 'closing' || this.state === 'closed') {
      throw new Error('Code Fusion orchestration ledger runtime registry is closed')
    }
  }
}

function normalizeProfileId(value: string): string {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error('Code Fusion orchestration ledger profile ID cannot be empty')
  }
  if (normalized.length > ORCHESTRATION_LEDGER_MAX_PROFILE_ID_LENGTH) {
    throw new Error('Code Fusion orchestration ledger profile ID is too long')
  }
  return normalized
}

function normalizeProfileStorageDirectory(value: string): string {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error('Code Fusion orchestration ledger profile directory cannot be empty')
  }
  if (normalized.length > ORCHESTRATION_LEDGER_MAX_PROFILE_DIRECTORY_LENGTH) {
    throw new Error('Code Fusion orchestration ledger profile directory is too long')
  }
  return resolve(normalized)
}

function sanitizeRegistryError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  const normalized = raw.trim() || 'Code Fusion orchestration ledger profile shutdown failed'
  return normalized
    .slice(0, 1_000)
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/((?:api[_-]?key|token|authorization)=)[^&\s]+/gi, '$1[redacted]')
}
