import { describe, expect, it, vi } from 'vitest'

import type {
  NativeIntelligenceHealth,
  NativeIntelligenceProvider,
  NativeModelDescriptor
} from '../../shared/code-fusion/native-intelligence-contract'
import { readNativeIntelligenceSnapshot } from './native-intelligence-read-model'

const READY_HEALTH: NativeIntelligenceHealth = {
  protocolVersion: 1,
  state: 'ready',
  runtimeName: 'Nativ-compatible local runtime',
  capabilities: ['chat']
}

const MODEL: NativeModelDescriptor = {
  id: 'mlx-community/Qwen3.5-9B-4bit',
  displayName: 'Qwen3.5-9B-4bit',
  source: 'local-cache',
  state: 'installed',
  capabilities: ['chat']
}

function providerWith(
  overrides: Partial<NativeIntelligenceProvider> = {}
): NativeIntelligenceProvider {
  return {
    getHealth: vi.fn(async () => READY_HEALTH),
    listModels: vi.fn(async () => [MODEL]),
    ...overrides
  }
}

const fixedClock = (): Date => new Date('2026-09-02T03:30:00.000Z')

describe('readNativeIntelligenceSnapshot', () => {
  it('returns ready health and model inventory as a renderer-safe snapshot', async () => {
    const provider = providerWith()

    const snapshot = await readNativeIntelligenceSnapshot(provider, fixedClock)

    expect(snapshot).toEqual({
      health: READY_HEALTH,
      models: [MODEL],
      refreshedAt: '2026-09-02T03:30:00.000Z'
    })
    expect(provider.listModels).toHaveBeenCalledTimes(1)
  })

  it('does not request model inventory when the runtime is unavailable', async () => {
    const listModels = vi.fn(async () => [MODEL])
    const provider = providerWith({
      getHealth: vi.fn(async () => ({ ...READY_HEALTH, state: 'unavailable' })),
      listModels
    })

    const snapshot = await readNativeIntelligenceSnapshot(provider, fixedClock)

    expect(snapshot.models).toEqual([])
    expect(snapshot.health.state).toBe('unavailable')
    expect(listModels).not.toHaveBeenCalled()
  })

  it('degrades a ready runtime when inventory fails and redacts bearer values', async () => {
    const provider = providerWith({
      listModels: vi.fn(async () => {
        throw new Error('request failed with Bearer super-secret')
      })
    })

    const snapshot = await readNativeIntelligenceSnapshot(provider, fixedClock)

    expect(snapshot.health.state).toBe('degraded')
    expect(snapshot.models).toEqual([])
    expect(snapshot.modelInventoryError).toBe('request failed with Bearer [redacted]')
    expect(snapshot.modelInventoryError).not.toContain('super-secret')
  })
})
