import type { StateCreator } from 'zustand'
import type { AppState } from '../types'
import type { NativeIntelligenceSnapshot } from '../../../../shared/code-fusion/native-intelligence-ipc'
import {
  beginNativeIntelligenceRefresh,
  EMPTY_NATIVE_INTELLIGENCE_VIEW_STATE,
  rejectNativeIntelligenceRefresh,
  resolveNativeIntelligenceRefresh,
  type NativeIntelligenceViewState
} from './native-intelligence-state'

export type NativeIntelligenceSlice = NativeIntelligenceViewState & {
  refreshNativeIntelligenceSnapshot: () => Promise<void>
}

export type NativeIntelligenceSnapshotReader = () => Promise<NativeIntelligenceSnapshot>

const readNativeIntelligenceSnapshot: NativeIntelligenceSnapshotReader = () =>
  window.api.nativeIntelligence.getSnapshot()

export function createNativeIntelligenceSliceWithReader(
  readSnapshot: NativeIntelligenceSnapshotReader
): StateCreator<AppState, [], [], NativeIntelligenceSlice> {
  return (set) => {
    let inFlightSnapshot: Promise<void> | null = null

    return {
      ...EMPTY_NATIVE_INTELLIGENCE_VIEW_STATE,

      refreshNativeIntelligenceSnapshot: () => {
        if (inFlightSnapshot) {
          return inFlightSnapshot
        }

        set((state) => beginNativeIntelligenceRefresh(state))
        const request = (async () => {
          try {
            const snapshot = await readSnapshot()
            set(resolveNativeIntelligenceRefresh(snapshot))
          } catch (error) {
            console.error('Failed to refresh native intelligence snapshot:', error)
            set((state) => rejectNativeIntelligenceRefresh(state, error))
          }
        })()

        const trackedRequest = request.finally(() => {
          if (inFlightSnapshot === trackedRequest) {
            inFlightSnapshot = null
          }
        })
        inFlightSnapshot = trackedRequest
        return trackedRequest
      }
    }
  }
}

export const createNativeIntelligenceSlice =
  createNativeIntelligenceSliceWithReader(readNativeIntelligenceSnapshot)
