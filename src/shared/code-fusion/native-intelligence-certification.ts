import type { NativeIntelligenceProtocolVersion } from './native-intelligence-contract'

export type NativeIntelligenceCertificationCheckId = 'runtime-ready' | 'model-inventory'
export type NativeIntelligenceCertificationCheckStatus = 'pass' | 'fail'

export type NativeIntelligenceCertificationCheck = {
  id: NativeIntelligenceCertificationCheckId
  status: NativeIntelligenceCertificationCheckStatus
  detail: string
}

/**
 * Renderer-safe evidence from the bounded read-only native-intelligence certification path.
 *
 * A `pass` result reports what the invoked environment observed. It does not by itself promote
 * source/unit evidence to `VERIFIED-RUNTIME`; the execution environment remains part of evidence.
 */
export type NativeIntelligenceCertificationReport = {
  result: NativeIntelligenceCertificationCheckStatus
  startedAt: string
  completedAt: string
  runtimeName: string | null
  protocolVersion: NativeIntelligenceProtocolVersion | null
  modelCount: number | null
  checks: readonly NativeIntelligenceCertificationCheck[]
}
