import type {
  NativeIntelligenceHealth,
  NativeModelDescriptor
} from './native-intelligence-contract'

export const NATIVE_INTELLIGENCE_IPC_CHANNELS = {
  getSnapshot: 'nativeIntelligence:getSnapshot'
} as const

/**
 * Renderer-safe read model for the first Code Fusion native-intelligence bridge.
 *
 * This intentionally contains no endpoint, credential, process-control or model-mutation data.
 */
export type NativeIntelligenceSnapshot = {
  health: NativeIntelligenceHealth
  models: readonly NativeModelDescriptor[]
  refreshedAt: string
  modelInventoryError?: string
}
