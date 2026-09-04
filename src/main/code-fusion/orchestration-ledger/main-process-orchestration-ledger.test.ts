import { describe, expect, it, vi } from 'vitest'
import type {
  OrchestrationLedgerProfileShutdownReport,
  OrchestrationLedgerRegistryShutdownReport
} from './orchestration-ledger-runtime-registry'
import type { OrchestrationLedgerRuntimeClient } from './orchestration-ledger-runtime-owner'
import {
  MainProcessOrchestrationLedgerController,
  type MainProcessOrchestrationLedgerRegistryPort
} from './main-process-orchestration-ledger'

type FakeClient = OrchestrationLedgerRuntimeClient & {
  id: string
}

type FakeRegistry = MainProcessOrchestrationLedgerRegistryPort<FakeClient> & {
  getClient: ReturnType<typeof vi.fn<(profileId: string, profileDirectory: string) => FakeClient>>
  release: ReturnType<
    typeof vi.fn<
      (profileId: string) => Promise<OrchestrationLedgerProfileShutdownReport | null>
    >
  >
  shutdownAll: ReturnType<
    typeof vi.fn<() => Promise<OrchestrationLedgerRegistryShutdownReport>>
  >
  disposeAll: ReturnType<
    typeof vi.fn<(reason?: string) => OrchestrationLedgerRegistryShutdownReport>
  >
}

function makeRegistry(options?: {
  shutdown?: () => Promise<OrchestrationLedgerRegistryShutdownReport>
  dispose?: (reason?: string) => OrchestrationLedgerRegistryShutdownReport
}): FakeRegistry {
  const client: FakeClient = {
    id: 'client',
    async close() {},
    dispose() {}
  }
  return {
    getClient: vi.fn(() => client),
    release: vi.fn(async (profileId) => ({
      profileId,
      outcome: 'closed',
      graceful: true,
      timedOut: false
    })),
    shutdownAll: vi.fn(
      options?.shutdown ??
        (async () => ({
          outcome: 'closed',
          profiles: []
        }))
    ),
    disposeAll: vi.fn(
      options?.dispose ??
        ((reason) => ({
          outcome: 'disposed',
          profiles: reason
            ? [
                {
                  profileId: 'profile-a',
                  outcome: 'disposed',
                  graceful: false,
                  timedOut: false,
                  error: reason
                }
              ]
            : []
        }))
    )
  }
}

describe('MainProcessOrchestrationLedgerController', () => {
  it('is side-effect free until the registry is requested', () => {
    const createRegistry = vi.fn(() => makeRegistry())
    const controller = new MainProcessOrchestrationLedgerController({ createRegistry })

    expect(controller.getState()).toBe('idle')
    expect(controller.isInitialized()).toBe(false)
    expect(createRegistry).not.toHaveBeenCalled()
  })

  it('creates one registry lazily and reuses it', () => {
    const registry = makeRegistry()
    const createRegistry = vi.fn(() => registry)
    const controller = new MainProcessOrchestrationLedgerController({ createRegistry })

    expect(controller.ensureRegistry()).toBe(registry)
    expect(controller.ensureRegistry()).toBe(registry)
    expect(createRegistry).toHaveBeenCalledTimes(1)
    expect(controller.getState()).toBe('ready')
  })

  it('does not retain a failed registry construction', () => {
    const registry = makeRegistry()
    const createRegistry = vi
      .fn<() => FakeRegistry>()
      .mockImplementationOnce(() => {
        throw new Error('registry construction failed')
      })
      .mockReturnValueOnce(registry)
    const controller = new MainProcessOrchestrationLedgerController({ createRegistry })

    expect(() => controller.ensureRegistry()).toThrow('registry construction failed')
    expect(controller.getState()).toBe('idle')
    expect(controller.isInitialized()).toBe(false)
    expect(controller.ensureRegistry()).toBe(registry)
    expect(createRegistry).toHaveBeenCalledTimes(2)
  })

  it('rejects a missing active profile before creating the registry', () => {
    const createRegistry = vi.fn(() => makeRegistry())
    const controller = new MainProcessOrchestrationLedgerController({ createRegistry })

    expect(() => controller.getActiveProfileClient(null)).toThrow(
      'active profile is unavailable'
    )
    expect(createRegistry).not.toHaveBeenCalled()
  })

  it('routes the active profile identity and directory to the registry', () => {
    const registry = makeRegistry()
    const controller = new MainProcessOrchestrationLedgerController({
      createRegistry: () => registry
    })

    const client = controller.getActiveProfileClient({
      profile: { id: ' profile-a ' },
      profileDirectory: ' /tmp/profile-a '
    })

    expect(client.id).toBe('client')
    expect(registry.getClient).toHaveBeenCalledWith('profile-a', '/tmp/profile-a')
  })

  it('releases an unused profile without creating the registry', async () => {
    const createRegistry = vi.fn(() => makeRegistry())
    const controller = new MainProcessOrchestrationLedgerController({ createRegistry })

    await expect(controller.releaseProfile('profile-a')).resolves.toBeNull()
    expect(createRegistry).not.toHaveBeenCalled()
    expect(controller.getState()).toBe('idle')
  })

  it('delegates profile release to the existing registry', async () => {
    const registry = makeRegistry()
    const controller = new MainProcessOrchestrationLedgerController({
      createRegistry: () => registry
    })
    controller.ensureRegistry()

    await expect(controller.releaseProfile(' profile-a ')).resolves.toMatchObject({
      profileId: 'profile-a',
      outcome: 'closed'
    })
    expect(registry.release).toHaveBeenCalledWith('profile-a')
  })

  it('shuts down an unused controller without creating a registry', async () => {
    const createRegistry = vi.fn(() => makeRegistry())
    const controller = new MainProcessOrchestrationLedgerController({ createRegistry })

    await expect(controller.shutdownAll()).resolves.toEqual({
      outcome: 'unused',
      profiles: []
    })
    expect(createRegistry).not.toHaveBeenCalled()
    expect(controller.getState()).toBe('closed')
    expect(() => controller.ensureRegistry()).toThrow('is closed')
  })

  it('shares one graceful registry shutdown and records its result', async () => {
    let resolveShutdown:
      | ((report: OrchestrationLedgerRegistryShutdownReport) => void)
      | undefined
    const registry = makeRegistry({
      shutdown: () =>
        new Promise((resolve) => {
          resolveShutdown = resolve
        })
    })
    const controller = new MainProcessOrchestrationLedgerController({
      createRegistry: () => registry
    })
    controller.ensureRegistry()

    const first = controller.shutdownAll()
    const second = controller.shutdownAll()
    expect(second).toBe(first)
    await Promise.resolve()
    resolveShutdown?.({ outcome: 'closed', profiles: [] })

    await expect(first).resolves.toEqual({ outcome: 'closed', profiles: [] })
    await expect(controller.shutdownAll()).resolves.toEqual({
      outcome: 'closed',
      profiles: []
    })
    expect(registry.shutdownAll).toHaveBeenCalledTimes(1)
    expect(controller.isInitialized()).toBe(false)
    expect(controller.getState()).toBe('closed')
  })

  it('preserves fatal-disposal evidence when graceful shutdown resolves later', async () => {
    let resolveShutdown:
      | ((report: OrchestrationLedgerRegistryShutdownReport) => void)
      | undefined
    const registry = makeRegistry({
      shutdown: () =>
        new Promise((resolve) => {
          resolveShutdown = resolve
        })
    })
    const controller = new MainProcessOrchestrationLedgerController({
      createRegistry: () => registry
    })
    controller.ensureRegistry()

    const pending = controller.shutdownAll()
    await Promise.resolve()
    const fatalReport = controller.disposeAll('fatal shutdown')
    resolveShutdown?.({ outcome: 'closed', profiles: [] })

    await expect(pending).resolves.toBe(fatalReport)
    await expect(controller.shutdownAll()).resolves.toBe(fatalReport)
    expect(registry.disposeAll).toHaveBeenCalledWith('fatal shutdown')
    expect(controller.getState()).toBe('closed')
  })

  it('fails closed and redacts errors when aggregate shutdown rejects', async () => {
    const registry = makeRegistry({
      shutdown: async () => {
        throw new Error('Bearer secret token=abc authorization=raw')
      }
    })
    const controller = new MainProcessOrchestrationLedgerController({
      createRegistry: () => registry
    })
    controller.ensureRegistry()

    await expect(controller.shutdownAll()).resolves.toEqual({
      outcome: 'disposed',
      profiles: [
        {
          profileId: 'profile-a',
          outcome: 'disposed',
          graceful: false,
          timedOut: false,
          error: 'Bearer [redacted] token=[redacted] authorization=[redacted]'
        }
      ]
    })
    expect(registry.disposeAll).toHaveBeenCalledWith(
      'Bearer [redacted] token=[redacted] authorization=[redacted]'
    )
  })

  it('supports immediate idempotent disposal for unused and active controllers', () => {
    const unused = new MainProcessOrchestrationLedgerController({
      createRegistry: () => makeRegistry()
    })
    expect(unused.disposeAll()).toEqual({ outcome: 'unused', profiles: [] })
    expect(unused.disposeAll()).toEqual({ outcome: 'unused', profiles: [] })

    const registry = makeRegistry()
    const active = new MainProcessOrchestrationLedgerController({
      createRegistry: () => registry
    })
    active.ensureRegistry()
    expect(active.disposeAll('fatal api_key=secret')).toMatchObject({
      outcome: 'disposed'
    })
    active.disposeAll('ignored')
    expect(registry.disposeAll).toHaveBeenCalledTimes(1)
    expect(registry.disposeAll).toHaveBeenCalledWith('fatal api_key=[redacted]')
  })

  it('validates routed profile identity before creating a registry', () => {
    const createRegistry = vi.fn(() => makeRegistry())
    const controller = new MainProcessOrchestrationLedgerController({ createRegistry })

    expect(() =>
      controller.getProfileClient({ profile: { id: ' ' }, profileDirectory: '/tmp/profile' })
    ).toThrow('profile ID cannot be empty')
    expect(() =>
      controller.getProfileClient({ profile: { id: 'profile' }, profileDirectory: ' ' })
    ).toThrow('profile directory cannot be empty')
    expect(createRegistry).not.toHaveBeenCalled()
  })
})
