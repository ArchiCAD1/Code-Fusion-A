import { describe, expect, it, vi } from 'vitest'
import { OrchestrationLedgerRuntimeOwner } from './orchestration-ledger-runtime-owner'

function makeClient(closeImpl: () => Promise<void> = async () => undefined) {
  return {
    close: vi.fn(closeImpl),
    dispose: vi.fn((_reason?: string) => undefined)
  }
}

describe('OrchestrationLedgerRuntimeOwner', () => {
  it('is side-effect free until the first client access', () => {
    const createClient = vi.fn(() => makeClient())
    const owner = new OrchestrationLedgerRuntimeOwner('/tmp/profile', { createClient })

    expect(owner.getState()).toBe('idle')
    expect(owner.isInitialized()).toBe(false)
    expect(createClient).not.toHaveBeenCalled()
  })

  it('creates one client lazily and reuses it', () => {
    const client = makeClient()
    const createClient = vi.fn(() => client)
    const owner = new OrchestrationLedgerRuntimeOwner(' /tmp/profile ', { createClient })

    expect(owner.getClient()).toBe(client)
    expect(owner.getClient()).toBe(client)
    expect(createClient).toHaveBeenCalledTimes(1)
    expect(createClient).toHaveBeenCalledWith('/tmp/profile')
    expect(owner.getState()).toBe('ready')
  })

  it('remains idle when client construction fails so explicit access can retry', () => {
    const client = makeClient()
    const createClient = vi
      .fn<() => ReturnType<typeof makeClient>>()
      .mockImplementationOnce(() => {
        throw new Error('worker output missing')
      })
      .mockReturnValueOnce(client)
    const owner = new OrchestrationLedgerRuntimeOwner('/tmp/profile', { createClient })

    expect(() => owner.getClient()).toThrow('worker output missing')
    expect(owner.getState()).toBe('idle')
    expect(owner.isInitialized()).toBe(false)
    expect(owner.getClient()).toBe(client)
    expect(createClient).toHaveBeenCalledTimes(2)
  })

  it('closes an unused owner without constructing a worker client', async () => {
    const createClient = vi.fn(() => makeClient())
    const owner = new OrchestrationLedgerRuntimeOwner('/tmp/profile', { createClient })

    await expect(owner.shutdown()).resolves.toEqual({
      outcome: 'unused',
      graceful: true,
      timedOut: false
    })
    expect(createClient).not.toHaveBeenCalled()
    expect(owner.getState()).toBe('closed')
    expect(() => owner.getClient()).toThrow('runtime owner is closed')
  })

  it('gracefully closes an initialized client and shares the in-flight promise', async () => {
    const client = makeClient()
    const owner = new OrchestrationLedgerRuntimeOwner('/tmp/profile', {
      createClient: () => client
    })
    owner.getClient()

    const first = owner.shutdown()
    const second = owner.shutdown()

    expect(second).toBe(first)
    await expect(first).resolves.toEqual({
      outcome: 'closed',
      graceful: true,
      timedOut: false
    })
    await expect(owner.shutdown()).resolves.toEqual({
      outcome: 'closed',
      graceful: true,
      timedOut: false
    })
    expect(client.close).toHaveBeenCalledTimes(1)
    expect(client.dispose).not.toHaveBeenCalled()
    expect(owner.getState()).toBe('closed')
  })

  it('disposes after a graceful-close failure and redacts credential-like text', async () => {
    const client = makeClient(async () => {
      throw new Error('Bearer secret token=abc api_key=xyz authorization=raw')
    })
    const owner = new OrchestrationLedgerRuntimeOwner('/tmp/profile', {
      createClient: () => client
    })
    owner.getClient()

    await expect(owner.shutdown()).resolves.toEqual({
      outcome: 'disposed',
      graceful: false,
      timedOut: false,
      error: 'Bearer [redacted] token=[redacted] api_key=[redacted] authorization=[redacted]'
    })
    expect(client.dispose).toHaveBeenCalledWith(
      'Bearer [redacted] token=[redacted] api_key=[redacted] authorization=[redacted]'
    )
  })

  it('disposes when graceful close exceeds its deadline', async () => {
    vi.useFakeTimers()
    const client = makeClient(() => new Promise<void>(() => undefined))
    const owner = new OrchestrationLedgerRuntimeOwner('/tmp/profile', {
      createClient: () => client,
      closeTimeoutMs: 25
    })
    owner.getClient()

    const result = owner.shutdown()
    await vi.advanceTimersByTimeAsync(25)

    await expect(result).resolves.toEqual({
      outcome: 'disposed',
      graceful: false,
      timedOut: true,
      error: 'Code Fusion orchestration ledger graceful close exceeded 25ms'
    })
    expect(client.dispose).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('supports immediate fail-closed disposal without opening an unused client', () => {
    const createClient = vi.fn(() => makeClient())
    const owner = new OrchestrationLedgerRuntimeOwner('/tmp/profile', { createClient })

    owner.dispose()
    owner.dispose()

    expect(createClient).not.toHaveBeenCalled()
    expect(owner.getState()).toBe('closed')
  })

  it('disposes an initialized client exactly once', () => {
    const client = makeClient()
    const owner = new OrchestrationLedgerRuntimeOwner('/tmp/profile', {
      createClient: () => client
    })
    owner.getClient()

    owner.dispose('fatal shutdown')
    owner.dispose('ignored')

    expect(client.dispose).toHaveBeenCalledTimes(1)
    expect(client.dispose).toHaveBeenCalledWith('fatal shutdown')
    expect(owner.getState()).toBe('closed')
  })

  it('rejects invalid construction settings', () => {
    expect(() => new OrchestrationLedgerRuntimeOwner('   ')).toThrow('cannot be empty')
    expect(
      () => new OrchestrationLedgerRuntimeOwner('/tmp/profile', { closeTimeoutMs: 0 })
    ).toThrow('positive and finite')
    expect(
      () => new OrchestrationLedgerRuntimeOwner('/tmp/profile', { closeTimeoutMs: Infinity })
    ).toThrow('positive and finite')
  })
})
