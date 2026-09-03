import { describe, expect, it } from 'vitest'

import type { NativeIntelligenceSnapshot } from '../../../../shared/code-fusion/native-intelligence-ipc'
import type { NativeIntelligenceViewState } from './native-intelligence-state'
import {
  isNativeIntelligenceSnapshotStale,
  selectNativeIntelligencePresentation
} from './native-intelligence-presentation'

const NOW = Date.parse('2026-09-02T16:01:00.000Z')

const SNAPSHOT: NativeIntelligenceSnapshot = {
  health: {
    protocolVersion: 1,
    state: 'ready',
    runtimeName: 'Nativ-compatible local runtime',
    capabilities: ['chat']
  },
  models: [
    {
      id: 'installed',
      displayName: 'Installed',
      source: 'local-cache',
      state: 'installed',
      capabilities: ['chat']
    },
    {
      id: 'loaded',
      displayName: 'Loaded',
      source: 'local-cache',
      state: 'loaded',
      capabilities: ['chat']
    },
    {
      id: 'available',
      displayName: 'Available',
      source: 'hugging-face',
      state: 'available',
      capabilities: ['chat']
    }
  ],
  refreshedAt: '2026-09-02T16:00:30.000Z'
}

function viewState(
  overrides: Partial<NativeIntelligenceViewState> = {}
): NativeIntelligenceViewState {
  return {
    nativeIntelligenceSnapshot: SNAPSHOT,
    nativeIntelligenceError: null,
    nativeIntelligenceRefreshing: false,
    ...overrides
  }
}

describe('selectNativeIntelligencePresentation', () => {
  it('distinguishes idle and first-refresh states before a snapshot exists', () => {
    const idle = selectNativeIntelligencePresentation(
      viewState({ nativeIntelligenceSnapshot: null }),
      NOW
    )
    const refreshing = selectNativeIntelligencePresentation(
      viewState({
        nativeIntelligenceSnapshot: null,
        nativeIntelligenceRefreshing: true
      }),
      NOW
    )

    expect(idle.kind).toBe('idle')
    expect(idle.hasSnapshot).toBe(false)
    expect(idle.canRetry).toBe(false)
    expect(refreshing.kind).toBe('refreshing')
    expect(refreshing.refreshing).toBe(true)
  })

  it('surfaces a hard refresh failure when no prior snapshot exists', () => {
    const presentation = selectNativeIntelligencePresentation(
      viewState({
        nativeIntelligenceSnapshot: null,
        nativeIntelligenceError: 'runtime offline'
      }),
      NOW
    )

    expect(presentation.kind).toBe('failed')
    expect(presentation.detail).toBe('runtime offline')
    expect(presentation.canRetry).toBe(true)
  })

  it('counts available, installed, and loaded models without conflating them', () => {
    const presentation = selectNativeIntelligencePresentation(viewState(), NOW)

    expect(presentation.kind).toBe('ready')
    expect(presentation.modelCount).toBe(3)
    expect(presentation.installedModelCount).toBe(2)
    expect(presentation.loadedModelCount).toBe(1)
    expect(presentation.inventoryAvailable).toBe(true)
    expect(presentation.canRetry).toBe(false)
  })

  it('marks inventory failure as retryable without hiding the last runtime health', () => {
    const presentation = selectNativeIntelligencePresentation(
      viewState({
        nativeIntelligenceSnapshot: {
          ...SNAPSHOT,
          modelInventoryError: 'inventory failed'
        }
      }),
      NOW
    )

    expect(presentation.kind).toBe('ready')
    expect(presentation.inventoryAvailable).toBe(false)
    expect(presentation.detail).toBe('inventory failed')
    expect(presentation.canRetry).toBe(true)
  })

  it('keeps degraded health visible while a refresh is in flight', () => {
    const presentation = selectNativeIntelligencePresentation(
      viewState({
        nativeIntelligenceSnapshot: {
          ...SNAPSHOT,
          health: { ...SNAPSHOT.health, state: 'degraded' }
        },
        nativeIntelligenceRefreshing: true
      }),
      NOW
    )

    expect(presentation.kind).toBe('degraded')
    expect(presentation.refreshing).toBe(true)
    expect(presentation.canRetry).toBe(true)
  })

  it('marks old snapshots stale and retryable', () => {
    const presentation = selectNativeIntelligencePresentation(
      viewState({
        nativeIntelligenceSnapshot: {
          ...SNAPSHOT,
          refreshedAt: '2026-09-02T15:00:00.000Z'
        }
      }),
      NOW
    )

    expect(presentation.isStale).toBe(true)
    expect(presentation.canRetry).toBe(true)
  })
})

describe('isNativeIntelligenceSnapshotStale', () => {
  it('treats invalid timestamps as stale', () => {
    expect(isNativeIntelligenceSnapshotStale('not-a-date', NOW)).toBe(true)
  })

  it('treats an invalid stale threshold as stale', () => {
    expect(isNativeIntelligenceSnapshotStale(SNAPSHOT.refreshedAt, NOW, -1)).toBe(true)
  })
})
