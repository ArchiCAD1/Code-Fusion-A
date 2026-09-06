import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { NativeIntelligenceRuntimeSection } from './NativeIntelligenceRuntimeSection'

vi.mock('@/store', () => {
  const state = {
    nativeIntelligenceSnapshot: {
      health: {
        protocolVersion: 1,
        state: 'ready',
        runtimeName: 'Nativ-compatible local runtime',
        runtimeVersion: 'alpha-test',
        capabilities: ['chat', 'responses']
      },
      models: [
        {
          id: 'org/Qwen-Test',
          displayName: 'Qwen-Test',
          source: 'local-cache',
          state: 'installed',
          capabilities: ['chat']
        }
      ],
      refreshedAt: '2026-09-05T18:00:00.000Z'
    },
    nativeIntelligenceError: null,
    nativeIntelligenceRefreshing: false,
    refreshNativeIntelligenceSnapshot: vi.fn(async () => undefined)
  }

  return {
    useAppStore: (selector: (value: typeof state) => unknown) => selector(state)
  }
})

describe('NativeIntelligenceRuntimeSection', () => {
  it('renders the ready runtime and discovered model inventory', () => {
    const markup = renderToStaticMarkup(<NativeIntelligenceRuntimeSection />)

    expect(markup).toContain('Local AI Runtime')
    expect(markup).toContain('Local AI ready')
    expect(markup).toContain('Nativ-compatible local runtime')
    expect(markup).toContain('Qwen-Test')
    expect(markup).toContain('Run Certification')
    expect(markup).toContain('Alpha safety boundary')
  })
})
