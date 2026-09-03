import { describe, expect, it } from 'vitest'

import type { NativeIntelligenceSnapshot } from '../../../../shared/code-fusion/native-intelligence-ipc'
import {
  beginNativeIntelligenceRefresh,
  EMPTY_NATIVE_INTELLIGENCE_VIEW_STATE,
  rejectNativeIntelligenceRefresh,
  resolveNativeIntelligenceRefresh,
  safeNativeIntelligenceRendererError
} from './native-intelligence-state'

const SNAPSHOT: NativeIntelligenceSnapshot = {
  health: {
    protocolVersion: 1,
    state: 'ready',
    runtimeName: 'Nativ-compatible local runtime',
    capabilities: ['chat']
  },
  models: [],
  refreshedAt: '2026-09-02T16:00:00.000Z'
}

describe('native intelligence renderer state', () => {
  it('enters refresh without discarding the last good snapshot', () => {
    const state = beginNativeIntelligenceRefresh({
      nativeIntelligenceSnapshot: SNAPSHOT,
      nativeIntelligenceError: 'old error',
      nativeIntelligenceRefreshing: false
    })

    expect(state.nativeIntelligenceSnapshot).toBe(SNAPSHOT)
    expect(state.nativeIntelligenceError).toBeNull()
    expect(state.nativeIntelligenceRefreshing).toBe(true)
  })

  it('publishes a successful snapshot and clears transient state', () => {
    expect(resolveNativeIntelligenceRefresh(SNAPSHOT)).toEqual({
      nativeIntelligenceSnapshot: SNAPSHOT,
      nativeIntelligenceError: null,
      nativeIntelligenceRefreshing: false
    })
  })

  it('keeps the last good snapshot when refresh fails', () => {
    const state = rejectNativeIntelligenceRefresh(
      {
        nativeIntelligenceSnapshot: SNAPSHOT,
        nativeIntelligenceError: null,
        nativeIntelligenceRefreshing: true
      },
      new Error('runtime unavailable')
    )

    expect(state.nativeIntelligenceSnapshot).toBe(SNAPSHOT)
    expect(state.nativeIntelligenceError).toBe('runtime unavailable')
    expect(state.nativeIntelligenceRefreshing).toBe(false)
  })

  it('redacts bearer and query-style credential values from renderer errors', () => {
    expect(
      safeNativeIntelligenceRendererError(
        new Error('Bearer super-secret token=abc123 api_key=xyz authorization=raw')
      )
    ).toBe('Bearer [redacted] token=[redacted] api_key=[redacted] authorization=[redacted]')
  })

  it('starts from an explicit empty state', () => {
    expect(EMPTY_NATIVE_INTELLIGENCE_VIEW_STATE).toEqual({
      nativeIntelligenceSnapshot: null,
      nativeIntelligenceError: null,
      nativeIntelligenceRefreshing: false
    })
  })
})
