import { describe, expect, it, vi } from 'vitest'

import type {
  NativeIntelligenceHealth,
  NativeIntelligenceProvider,
  NativeModelDescriptor
} from '../../shared/code-fusion/native-intelligence-contract'
import { runNativeIntelligenceReadCertification } from './native-intelligence-certification'

const READY_HEALTH: NativeIntelligenceHealth = {
  protocolVersion: 1,
  state: 'ready',
  runtimeName: 'Nativ-compatible local runtime',
  capabilities: ['chat']
}

const MODELS: readonly NativeModelDescriptor[] = [
  {
    id: 'model-a',
    displayName: 'Model A',
    source: 'local-cache',
    state: 'installed',
    capabilities: ['chat']
  },
  {
    id: 'model-b',
    displayName: 'Model B',
    source: 'local-cache',
    state: 'installed',
    capabilities: ['chat']
  }
]

function clock(...timestamps: string[]): () => Date {
  const values = [...timestamps]
  return () => new Date(values.shift() ?? timestamps.at(-1))
}

function providerWith(
  overrides: Partial<NativeIntelligenceProvider> = {}
): NativeIntelligenceProvider {
  return {
    getHealth: vi.fn(async () => READY_HEALTH),
    listModels: vi.fn(async () => MODELS),
    ...overrides
  }
}

describe('runNativeIntelligenceReadCertification', () => {
  it('passes when the runtime is ready and inventory is readable', async () => {
    const report = await runNativeIntelligenceReadCertification(
      providerWith(),
      clock('2026-09-02T17:00:00.000Z', '2026-09-02T17:00:01.000Z')
    )

    expect(report).toEqual({
      result: 'pass',
      startedAt: '2026-09-02T17:00:00.000Z',
      completedAt: '2026-09-02T17:00:01.000Z',
      runtimeName: 'Nativ-compatible local runtime',
      protocolVersion: 1,
      modelCount: 2,
      checks: [
        { id: 'runtime-ready', status: 'pass', detail: 'Runtime reported ready.' },
        { id: 'model-inventory', status: 'pass', detail: '2 models returned.' }
      ]
    })
  })

  it('does not request inventory when the runtime is not ready', async () => {
    const listModels = vi.fn(async () => MODELS)
    const provider = providerWith({
      getHealth: vi.fn(async () => ({
        ...READY_HEALTH,
        state: 'unavailable',
        message: 'offline'
      })),
      listModels
    })

    const report = await runNativeIntelligenceReadCertification(
      provider,
      clock('2026-09-02T17:01:00.000Z', '2026-09-02T17:01:01.000Z')
    )

    expect(report.result).toBe('fail')
    expect(report.modelCount).toBeNull()
    expect(report.checks[0].detail).toBe('offline')
    expect(listModels).not.toHaveBeenCalled()
  })

  it('fails inventory independently after readiness passes', async () => {
    const report = await runNativeIntelligenceReadCertification(
      providerWith({
        listModels: vi.fn(async () => {
          throw new Error('inventory request failed')
        })
      }),
      clock('2026-09-02T17:02:00.000Z', '2026-09-02T17:02:01.000Z')
    )

    expect(report.result).toBe('fail')
    expect(report.checks[0].status).toBe('pass')
    expect(report.checks[1]).toEqual({
      id: 'model-inventory',
      status: 'fail',
      detail: 'inventory request failed'
    })
  })

  it('records health read failure without manufacturing runtime metadata', async () => {
    const report = await runNativeIntelligenceReadCertification(
      providerWith({
        getHealth: vi.fn(async () => {
          throw new Error('health request failed')
        })
      }),
      clock('2026-09-02T17:03:00.000Z', '2026-09-02T17:03:01.000Z')
    )

    expect(report.result).toBe('fail')
    expect(report.runtimeName).toBeNull()
    expect(report.protocolVersion).toBeNull()
    expect(report.modelCount).toBeNull()
  })

  it('redacts credential-like values from certification failures', async () => {
    const report = await runNativeIntelligenceReadCertification(
      providerWith({
        listModels: vi.fn(async () => {
          throw new Error('Bearer secret token=abc api_key=xyz authorization=raw')
        })
      }),
      clock('2026-09-02T17:04:00.000Z', '2026-09-02T17:04:01.000Z')
    )

    expect(report.checks[1].detail).toBe(
      'Bearer [redacted] token=[redacted] api_key=[redacted] authorization=[redacted]'
    )
  })
})
