import type { NativeIntelligenceSnapshot } from '../../../../shared/code-fusion/native-intelligence-ipc'

export type NativeIntelligenceViewState = {
  nativeIntelligenceSnapshot: NativeIntelligenceSnapshot | null
  nativeIntelligenceError: string | null
  nativeIntelligenceRefreshing: boolean
}

export const EMPTY_NATIVE_INTELLIGENCE_VIEW_STATE: NativeIntelligenceViewState = {
  nativeIntelligenceSnapshot: null,
  nativeIntelligenceError: null,
  nativeIntelligenceRefreshing: false
}

export function beginNativeIntelligenceRefresh(
  state: NativeIntelligenceViewState
): NativeIntelligenceViewState {
  return {
    ...state,
    nativeIntelligenceError: null,
    nativeIntelligenceRefreshing: true
  }
}

export function resolveNativeIntelligenceRefresh(
  snapshot: NativeIntelligenceSnapshot
): NativeIntelligenceViewState {
  return {
    nativeIntelligenceSnapshot: snapshot,
    nativeIntelligenceError: null,
    nativeIntelligenceRefreshing: false
  }
}

export function rejectNativeIntelligenceRefresh(
  state: NativeIntelligenceViewState,
  error: unknown
): NativeIntelligenceViewState {
  return {
    ...state,
    nativeIntelligenceError: safeNativeIntelligenceRendererError(error),
    nativeIntelligenceRefreshing: false
  }
}

export function safeNativeIntelligenceRendererError(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String(error)
  const normalized = rawMessage.trim() || 'Native intelligence refresh failed'
  return normalized
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/((?:api[_-]?key|token|authorization)=)[^&\s]+/gi, '$1[redacted]')
}
