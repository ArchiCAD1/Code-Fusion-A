import type { NativeIntelligenceSnapshot } from '../../shared/code-fusion/native-intelligence-ipc'

export type NativeIntelligenceApi = {
  /** Read-only runtime health and installed-model inventory. */
  getSnapshot: () => Promise<NativeIntelligenceSnapshot>
}
