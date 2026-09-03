import type { NativeIntelligenceCertificationReport } from '../../shared/code-fusion/native-intelligence-certification'
import type { NativeIntelligenceSnapshot } from '../../shared/code-fusion/native-intelligence-ipc'

export type NativeIntelligenceApi = {
  /** Read-only runtime health and installed-model inventory. */
  getSnapshot: () => Promise<NativeIntelligenceSnapshot>
  /** Runs the bounded read-only readiness + inventory certification scenario. */
  runReadCertification: () => Promise<NativeIntelligenceCertificationReport>
}
