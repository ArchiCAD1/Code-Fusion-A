import type { NativeIntelligenceHealthState } from '../../../../shared/code-fusion/native-intelligence-contract'
import type { NativeIntelligenceViewState } from './native-intelligence-state'

export const DEFAULT_NATIVE_INTELLIGENCE_STALE_AFTER_MS = 60_000

export type NativeIntelligencePresentationKind =
  | 'idle'
  | 'refreshing'
  | NativeIntelligenceHealthState

export type NativeIntelligencePresentation = {
  kind: NativeIntelligencePresentationKind
  title: string
  detail: string | null
  refreshing: boolean
  hasSnapshot: boolean
  isStale: boolean
  modelCount: number
  installedModelCount: number
  loadedModelCount: number
  inventoryAvailable: boolean
  canRetry: boolean
}

export function selectNativeIntelligencePresentation(
  state: NativeIntelligenceViewState,
  nowMs: number = Date.now(),
  staleAfterMs: number = DEFAULT_NATIVE_INTELLIGENCE_STALE_AFTER_MS
): NativeIntelligencePresentation {
  const snapshot = state.nativeIntelligenceSnapshot
  if (!snapshot) {
    if (state.nativeIntelligenceRefreshing) {
      return emptyPresentation('refreshing', 'Checking local AI runtime…', null, true, false)
    }
    if (state.nativeIntelligenceError) {
      return emptyPresentation(
        'failed',
        'Local AI status unavailable',
        state.nativeIntelligenceError,
        false,
        true
      )
    }
    return emptyPresentation('idle', 'Local AI not checked', null, false, false)
  }

  const health = snapshot.health
  const modelCount = snapshot.models.length
  const installedModelCount = snapshot.models.filter(
    (model) => model.state === 'installed' || model.state === 'loaded'
  ).length
  const loadedModelCount = snapshot.models.filter((model) => model.state === 'loaded').length
  const inventoryAvailable = !snapshot.modelInventoryError
  const isStale = isNativeIntelligenceSnapshotStale(snapshot.refreshedAt, nowMs, staleAfterMs)
  const detail =
    state.nativeIntelligenceError ??
    snapshot.modelInventoryError ??
    health.message ??
    defaultHealthDetail(health.state, modelCount)

  return {
    kind: health.state,
    title: healthTitle(health.state),
    detail,
    refreshing: state.nativeIntelligenceRefreshing,
    hasSnapshot: true,
    isStale,
    modelCount,
    installedModelCount,
    loadedModelCount,
    inventoryAvailable,
    canRetry:
      Boolean(state.nativeIntelligenceError) ||
      Boolean(snapshot.modelInventoryError) ||
      health.state !== 'ready' ||
      isStale
  }
}

export function isNativeIntelligenceSnapshotStale(
  refreshedAt: string,
  nowMs: number = Date.now(),
  staleAfterMs: number = DEFAULT_NATIVE_INTELLIGENCE_STALE_AFTER_MS
): boolean {
  if (!Number.isFinite(nowMs) || !Number.isFinite(staleAfterMs) || staleAfterMs < 0) {
    return true
  }
  const refreshedAtMs = Date.parse(refreshedAt)
  if (!Number.isFinite(refreshedAtMs)) {
    return true
  }
  return nowMs - refreshedAtMs > staleAfterMs
}

function emptyPresentation(
  kind: NativeIntelligencePresentationKind,
  title: string,
  detail: string | null,
  refreshing: boolean,
  canRetry: boolean
): NativeIntelligencePresentation {
  return {
    kind,
    title,
    detail,
    refreshing,
    hasSnapshot: false,
    isStale: false,
    modelCount: 0,
    installedModelCount: 0,
    loadedModelCount: 0,
    inventoryAvailable: false,
    canRetry
  }
}

function healthTitle(state: NativeIntelligenceHealthState): string {
  switch (state) {
    case 'ready':
      return 'Local AI ready'
    case 'degraded':
      return 'Local AI partially available'
    case 'starting':
      return 'Local AI starting'
    case 'stopping':
      return 'Local AI stopping'
    case 'failed':
      return 'Local AI failed'
    case 'unavailable':
      return 'Local AI unavailable'
  }
}

function defaultHealthDetail(
  state: NativeIntelligenceHealthState,
  modelCount: number
): string | null {
  switch (state) {
    case 'ready':
      return modelCount === 1 ? '1 local model available' : `${modelCount} local models available`
    case 'degraded':
      return 'The local runtime is reachable but some capabilities are unavailable.'
    case 'starting':
      return 'Waiting for the local runtime to become ready.'
    case 'stopping':
      return 'The local runtime is shutting down.'
    case 'failed':
      return 'The local runtime reported a failure.'
    case 'unavailable':
      return 'The local runtime could not be reached.'
  }
}
