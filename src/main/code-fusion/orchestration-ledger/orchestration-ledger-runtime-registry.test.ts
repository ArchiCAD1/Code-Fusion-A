import { describe, expect, it, vi } from 'vitest'
import type {
  OrchestrationLedgerRuntimeClient,
  OrchestrationLedgerShutdownReport
} from './orchestration-ledger-runtime-owner'
import {
  OrchestrationLedgerRuntimeRegistry,
  type OrchestrationLedgerRuntimeOwnerPort
} from './orchestration-ledger-runtime-registry'

type FakeClient = OrchestrationLedgerRuntimeClient & {
  id: string
}

type FakeOwner = OrchestrationLedgerRuntimeOwnerPort<FakeClient> & {
  getClient: ReturnType<typeof vi.fn<() => FakeClient>>
  shutdown: ReturnType<typeof vi.fn<() => Promise<OrchestrationLedgerShutdownReport>>>
  dispose: ReturnType<typeof vi.fn<(reason?: string) => void>>
}

function makeOwner(
  id: string,
  shutdown: () => Promise<OrchestrationLedgerShutdownReport> = async () => ({
    outcome: 'closed',
    graceful: true,
    timedOut: false
  })
): FakeOwner {
  const client: FakeClient = {
    id,
    async close() {},
    dispose() {}
  }
  return {
    getClient: vi.fn(() => client),
    shutdown: vi.fn(shutdown),
    dispose: vi.fn()
  }
}

describe('OrchestrationLedgerRuntimeRegistry', () => {
  it('is side-effect free until a profile is requested', () => {
    const createOwner = vi.fn((directory: string) => makeOwner(directory))
    const registry = new OrchestrationLedgerRuntimeRegistry({ createOwner })

    expect(registry.getState()).toBe('idle')
    expect(registry.size).toBe(0)
    expect(createOwner).not.toHaveBeenCalled()
  })

  it('normalizes identity, creates one owner, and reuses its client', () => {
    const owner = makeOwner('profile-a')
    const createOwner = vi.fn(() => owner)
    const registry = new OrchestrationLedgerRuntimeRegistry({ createOwner })

    expect(registry.getClient(' profile-a ', '/tmp/profile-a')).toBe(
      registry.getClient('profile-a', '/tmp/profile-a')
    )
    expect(createOwner).toHaveBeenCalledTimes(1)
    expect(owner.getClient).toHaveBeenCalledTimes(2)
    expect(registry.listProfileIds()).toEqual(['profile-a'])
    expect(registry.getState()).toBe('active')
  })

  it('rejects profile identity drift to a different storage directory', () => {
    const registry = new OrchestrationLedgerRuntimeRegistry({
      createOwner: () => makeOwner('profile-a')
    })
    registry.getOrCreateOwner('profile-a', '/tmp/profile-a')

    expect(() =>
      registry.getOrCreateOwner('profile-a', '/tmp/other-profile')
    ).toThrow('changed storage directory')
    expect(registry.size).toBe(1)
  })

  it('does not retain an entry when owner construction fails', () => {
    const owner = makeOwner('profile-a')
    const createOwner = vi
      .fn<(directory: string) => FakeOwner>()
      .mockImplementationOnce(() => {
        throw new Error('invalid worker configuration')
      })
      .mockReturnValueOnce(owner)
    const registry = new OrchestrationLedgerRuntimeRegistry({ createOwner })

    expect(() => registry.getOrCreateOwner('profile-a', '/tmp/profile-a')).toThrow(
      'invalid worker configuration'
    )
    expect(registry.size).toBe(0)
    expect(registry.getOrCreateOwner('profile-a', '/tmp/profile-a')).toBe(owner)
    expect(createOwner).toHaveBeenCalledTimes(2)
  })

  it('bounds the number of retained profile owners', () => {
    const registry = new OrchestrationLedgerRuntimeRegistry({
      maxProfiles: 2,
      createOwner: (directory) => makeOwner(directory)
    })

    registry.getOrCreateOwner('a', '/tmp/a')
    registry.getOrCreateOwner('b', '/tmp/b')
    expect(() => registry.getOrCreateOwner('c', '/tmp/c')).toThrow(
      'profile limit of 2'
    )
  })

  it('shares an in-flight release and blocks recreation until shutdown completes', async () => {
    let resolveShutdown: ((report: OrchestrationLedgerShutdownReport) => void) | undefined
    const owner = makeOwner(
      'profile-a',
      () =>
        new Promise((resolve) => {
          resolveShutdown = resolve
        })
    )
    const registry = new OrchestrationLedgerRuntimeRegistry({
      createOwner: () => owner
    })
    registry.getOrCreateOwner('profile-a', '/tmp/profile-a')

    const first = registry.release('profile-a')
    const second = registry.release(' profile-a ')
    expect(second).toBe(first)
    expect(() => registry.getOrCreateOwner('profile-a', '/tmp/profile-a')).toThrow(
      'is closing'
    )

    await Promise.resolve()
    resolveShutdown?.({ outcome: 'closed', graceful: true, timedOut: false })
    await expect(first).resolves.toMatchObject({
      profileId: 'profile-a',
      outcome: 'closed',
      graceful: true
    })
    expect(registry.size).toBe(0)
    expect(registry.getState()).toBe('idle')
  })

  it('shuts all profiles concurrently and returns deterministic reports', async () => {
    const owners = new Map([
      ['b', makeOwner('b')],
      ['a', makeOwner('a')]
    ])
    const registry = new OrchestrationLedgerRuntimeRegistry({
      createOwner: (directory) => {
        const id = directory.endsWith('/a') ? 'a' : 'b'
        const owner = owners.get(id)
        if (!owner) throw new Error('missing owner')
        return owner
      }
    })
    registry.getOrCreateOwner('b', '/tmp/b')
    registry.getOrCreateOwner('a', '/tmp/a')

    await expect(registry.shutdownAll()).resolves.toEqual({
      outcome: 'closed',
      profiles: [
        { profileId: 'a', outcome: 'closed', graceful: true, timedOut: false },
        { profileId: 'b', outcome: 'closed', graceful: true, timedOut: false }
      ]
    })
    expect(registry.getState()).toBe('closed')
    expect(registry.size).toBe(0)
    expect(() => registry.getOrCreateOwner('c', '/tmp/c')).toThrow(
      'registry is closed'
    )
  })

  it('fails one profile closed without losing other shutdown evidence', async () => {
    const failed = makeOwner('failed', async () => {
      throw new Error('Bearer secret token=abc')
    })
    const healthy = makeOwner('healthy')
    const registry = new OrchestrationLedgerRuntimeRegistry({
      createOwner: (directory) => (directory.endsWith('/failed') ? failed : healthy)
    })
    registry.getOrCreateOwner('failed', '/tmp/failed')
    registry.getOrCreateOwner('healthy', '/tmp/healthy')

    const report = await registry.shutdownAll()

    expect(report.outcome).toBe('partial')
    expect(report.profiles).toEqual([
      {
        profileId: 'failed',
        outcome: 'disposed',
        graceful: false,
        timedOut: false,
        error: 'Bearer [redacted] token=[redacted]'
      },
      {
        profileId: 'healthy',
        outcome: 'closed',
        graceful: true,
        timedOut: false
      }
    ])
    expect(failed.dispose).toHaveBeenCalledWith(
      'Bearer [redacted] token=[redacted]'
    )
  })

  it('disposes all owners immediately and idempotently for fatal teardown', () => {
    const a = makeOwner('a')
    const b = makeOwner('b')
    const registry = new OrchestrationLedgerRuntimeRegistry({
      createOwner: (directory) => (directory.endsWith('/a') ? a : b)
    })
    registry.getOrCreateOwner('b', '/tmp/b')
    registry.getOrCreateOwner('a', '/tmp/a')

    expect(registry.disposeAll('fatal authorization=secret')).toEqual({
      outcome: 'disposed',
      profiles: [
        {
          profileId: 'a',
          outcome: 'disposed',
          graceful: false,
          timedOut: false,
          error: 'fatal authorization=[redacted]'
        },
        {
          profileId: 'b',
          outcome: 'disposed',
          graceful: false,
          timedOut: false,
          error: 'fatal authorization=[redacted]'
        }
      ]
    })
    registry.disposeAll('ignored')
    expect(a.dispose).toHaveBeenCalledTimes(1)
    expect(b.dispose).toHaveBeenCalledTimes(1)
    expect(registry.getState()).toBe('closed')
  })

  it('validates profile and registry bounds', () => {
    expect(() => new OrchestrationLedgerRuntimeRegistry({ maxProfiles: 0 })).toThrow(
      'positive safe integer'
    )
    const registry = new OrchestrationLedgerRuntimeRegistry({
      createOwner: () => makeOwner('owner')
    })
    expect(() => registry.getOrCreateOwner(' ', '/tmp/profile')).toThrow(
      'profile ID cannot be empty'
    )
    expect(() => registry.getOrCreateOwner('profile', ' ')).toThrow(
      'profile directory cannot be empty'
    )
    expect(() =>
      registry.getOrCreateOwner('x'.repeat(257), '/tmp/profile')
    ).toThrow('profile ID is too long')
  })
})
