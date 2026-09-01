export const NATIVE_INTELLIGENCE_PROTOCOL_VERSION = 1 as const

export const NATIVE_INTELLIGENCE_CAPABILITIES = [
  'chat',
  'responses',
  'vision',
  'images',
  'audio',
  'embeddings',
  'model-downloads',
  'system-metrics',
  'mcp'
] as const

export type NativeIntelligenceProtocolVersion = typeof NATIVE_INTELLIGENCE_PROTOCOL_VERSION
export type NativeIntelligenceCapability = (typeof NATIVE_INTELLIGENCE_CAPABILITIES)[number]

export type NativeIntelligenceHealthState =
  | 'unavailable'
  | 'starting'
  | 'ready'
  | 'degraded'
  | 'stopping'
  | 'failed'

export type NativeModelSource = 'hugging-face' | 'local-cache' | 'external'
export type NativeModelLifecycleState = 'available' | 'downloading' | 'installed' | 'loading' | 'loaded' | 'failed'

export interface NativeIntelligenceRequestOptions {
  signal?: AbortSignal
}

export interface NativeIntelligenceHealth {
  protocolVersion: NativeIntelligenceProtocolVersion
  state: NativeIntelligenceHealthState
  runtimeName: string
  runtimeVersion?: string
  capabilities: readonly NativeIntelligenceCapability[]
  message?: string
}

export interface NativeModelDescriptor {
  id: string
  displayName: string
  source: NativeModelSource
  state: NativeModelLifecycleState
  capabilities: readonly NativeIntelligenceCapability[]
  sizeBytes?: number
  minimumMemoryBytes?: number
  installedBytes?: number
}

export interface NativeModelDownloadProgress {
  modelId: string
  receivedBytes: number
  totalBytes?: number
  bytesPerSecond?: number
  fractionCompleted?: number
}

export interface NativeSystemMetrics {
  physicalMemoryBytes: number
  usedMemoryBytes?: number
  swapUsedBytes?: number
  cpuUtilization?: number
  gpuUtilization?: number
  thermalState?: 'nominal' | 'fair' | 'serious' | 'critical' | 'unknown'
}

export interface NativeIntelligenceProvider {
  getHealth(options?: NativeIntelligenceRequestOptions): Promise<NativeIntelligenceHealth>
  listModels(options?: NativeIntelligenceRequestOptions): Promise<readonly NativeModelDescriptor[]>
  downloadModel?(
    modelId: string,
    onProgress?: (progress: NativeModelDownloadProgress) => void,
    options?: NativeIntelligenceRequestOptions
  ): Promise<void>
  cancelModelDownload?(modelId: string): Promise<void>
  removeModel?(modelId: string, options?: NativeIntelligenceRequestOptions): Promise<void>
  loadModel?(modelId: string, options?: NativeIntelligenceRequestOptions): Promise<void>
  unloadModel?(modelId?: string, options?: NativeIntelligenceRequestOptions): Promise<void>
  getSystemMetrics?(options?: NativeIntelligenceRequestOptions): Promise<NativeSystemMetrics>
}

export function isNativeIntelligenceProtocolVersion(
  value: unknown
): value is NativeIntelligenceProtocolVersion {
  return value === NATIVE_INTELLIGENCE_PROTOCOL_VERSION
}

export function supportsNativeIntelligenceCapability(
  health: Pick<NativeIntelligenceHealth, 'capabilities'>,
  capability: NativeIntelligenceCapability
): boolean {
  return health.capabilities.includes(capability)
}
