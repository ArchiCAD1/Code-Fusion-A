import type {
  NativeIntelligenceCapability,
  NativeIntelligenceHealthState,
  NativeModelSource
} from './native-intelligence-contract'

export const MODEL_HUB_CONTRACT_VERSION = 1 as const
export const MODEL_HUB_DEFAULT_PAGE_LIMIT = 24
export const MODEL_HUB_MAX_PAGE_LIMIT = 100
export const MODEL_HUB_MAX_MODEL_ID_LENGTH = 512
export const MODEL_HUB_MAX_QUERY_LENGTH = 512
export const MODEL_HUB_MAX_CURSOR_LENGTH = 4_096
export const MODEL_HUB_MAX_STORAGE_TARGET_ID_LENGTH = 256
export const MODEL_HUB_MAX_ERROR_MESSAGE_LENGTH = 1_000

export type ModelHubContractVersion = typeof MODEL_HUB_CONTRACT_VERSION

export type ModelHubCatalogSort =
  | 'downloads'
  | 'trending'
  | 'likes'
  | 'recently-updated'
  | 'size'
  | 'name'

export type ModelHubSortDirection = 'ascending' | 'descending'
export type ModelHubAvailability = 'public' | 'gated' | 'private'
export type ModelHubFitAssessment =
  | 'unknown'
  | 'recommended'
  | 'fits'
  | 'tight'
  | 'exceeds-memory'

export type ModelHubModelState =
  | 'available'
  | 'installed'
  | 'loading'
  | 'loaded'
  | 'unloading'
  | 'removing'
  | 'failed'

export type ModelHubCatalogQuery = {
  query?: string
  sort?: ModelHubCatalogSort
  direction?: ModelHubSortDirection
  capabilities?: readonly NativeIntelligenceCapability[]
  cursor?: string
  limit?: number
  includeGated?: boolean
}

export type NormalizedModelHubCatalogQuery = {
  query?: string
  sort: ModelHubCatalogSort
  direction: ModelHubSortDirection
  capabilities: readonly NativeIntelligenceCapability[]
  cursor?: string
  limit: number
  includeGated: boolean
}

export type ModelHubModelDescriptor = {
  contractVersion: ModelHubContractVersion
  id: string
  displayName: string
  source: NativeModelSource
  provider?: string
  state: ModelHubModelState
  availability: ModelHubAvailability
  capabilities: readonly NativeIntelligenceCapability[]
  fit: ModelHubFitAssessment
  sizeBytes?: number
  estimatedDownloadBytes?: number
  minimumMemoryBytes?: number
  installedBytes?: number
  downloadCount?: number
  likeCount?: number
  lastModifiedAt?: string
  drafterKind?: string
}

export type ModelHubCatalogPage = {
  contractVersion: ModelHubContractVersion
  models: readonly ModelHubModelDescriptor[]
  nextCursor?: string
  fetchedAt: string
}

export type ModelHubStorageTargetKind = 'default-cache' | 'external-cache'
export type ModelHubStorageTargetState = 'ready' | 'unavailable' | 'read-only' | 'disconnected'

/** Renderer-safe storage summary. The filesystem path and volume identity remain process-private. */
export type ModelHubStorageTargetSummary = {
  id: string
  displayName: string
  kind: ModelHubStorageTargetKind
  state: ModelHubStorageTargetState
  availableBytes?: number
  reservedBytes?: number
}

export type ModelHubDownloadPhase =
  | 'queued'
  | 'preparing'
  | 'downloading'
  | 'paused'
  | 'retrying'
  | 'finalizing'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type ModelHubDownloadErrorCode =
  | 'gated-access-required'
  | 'insufficient-storage'
  | 'storage-unavailable'
  | 'runtime-unavailable'
  | 'network'
  | 'stalled'
  | 'validation-failed'
  | 'cancelled'
  | 'unknown'

export type ModelHubDownloadError = {
  code: ModelHubDownloadErrorCode
  message: string
  retryable: boolean
}

export type ModelHubDownloadSnapshot = {
  operationId: string
  modelId: string
  storageTargetId: string
  phase: ModelHubDownloadPhase
  completedBytes: number
  totalBytes?: number
  bytesPerSecond?: number
  attempt?: number
  maximumAttempts?: number
  startedAt: string
  updatedAt: string
  error?: ModelHubDownloadError
}

export type ModelHubDownloadRequest = {
  requestId: string
  modelId: string
  storageTargetId: string
  expectedBytes?: number
}

export type ModelHubDownloadAction = 'pause' | 'resume' | 'cancel' | 'retry'

export type ModelHubRuntimeSummary = {
  healthState: NativeIntelligenceHealthState
  supportsDownloads: boolean
  supportsSystemMetrics: boolean
  modelCount: number
  installedModelCount: number
  loadedModelCount: number
  activeDownloads: readonly ModelHubDownloadSnapshot[]
}

export function normalizeModelHubCatalogQuery(
  input: ModelHubCatalogQuery = {}
): NormalizedModelHubCatalogQuery {
  const query = normalizeOptionalText(input.query, MODEL_HUB_MAX_QUERY_LENGTH, 'query')
  const cursor = normalizeOptionalText(input.cursor, MODEL_HUB_MAX_CURSOR_LENGTH, 'cursor')
  const limit = input.limit ?? MODEL_HUB_DEFAULT_PAGE_LIMIT
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MODEL_HUB_MAX_PAGE_LIMIT) {
    throw new Error(
      `Code Fusion Model Hub page limit must be a safe integer from 1 to ${MODEL_HUB_MAX_PAGE_LIMIT}`
    )
  }

  return {
    ...(query ? { query } : {}),
    sort: input.sort ?? 'downloads',
    direction: input.direction ?? 'descending',
    capabilities: Array.from(new Set(input.capabilities ?? [])),
    ...(cursor ? { cursor } : {}),
    limit,
    includeGated: input.includeGated ?? false
  }
}

export function createModelHubDownloadRequest(input: {
  requestId: string
  modelId: string
  storageTargetId: string
  expectedBytes?: number
}): ModelHubDownloadRequest {
  const requestId = normalizeOpaqueIdentifier(input.requestId, 256, 'request ID')
  const modelId = normalizeModelHubModelId(input.modelId)
  const storageTargetId = normalizeOpaqueIdentifier(
    input.storageTargetId,
    MODEL_HUB_MAX_STORAGE_TARGET_ID_LENGTH,
    'storage target ID'
  )
  const expectedBytes = input.expectedBytes
  if (
    expectedBytes !== undefined &&
    (!Number.isSafeInteger(expectedBytes) || expectedBytes <= 0)
  ) {
    throw new Error('Code Fusion Model Hub expected download bytes must be a positive safe integer')
  }

  return {
    requestId,
    modelId,
    storageTargetId,
    ...(expectedBytes !== undefined ? { expectedBytes } : {})
  }
}

/**
 * Model IDs are external identifiers, never filesystem paths. Normalize the value here, then keep
 * path construction inside the native runtime/storage broker.
 */
export function normalizeModelHubModelId(value: string): string {
  return normalizeOpaqueIdentifier(value, MODEL_HUB_MAX_MODEL_ID_LENGTH, 'model ID')
}

export function isTerminalModelHubDownloadPhase(phase: ModelHubDownloadPhase): boolean {
  return phase === 'completed' || phase === 'failed' || phase === 'cancelled'
}

export function availableModelHubDownloadActions(
  phase: ModelHubDownloadPhase,
  retryable = true
): readonly ModelHubDownloadAction[] {
  switch (phase) {
    case 'queued':
    case 'preparing':
    case 'retrying':
    case 'finalizing':
      return ['cancel']
    case 'downloading':
      return ['pause', 'cancel']
    case 'paused':
      return ['resume', 'cancel']
    case 'failed':
      return retryable ? ['retry'] : []
    case 'completed':
    case 'cancelled':
      return []
  }
}

export function modelHubDownloadFraction(
  snapshot: Pick<ModelHubDownloadSnapshot, 'completedBytes' | 'totalBytes'>
): number | null {
  const { completedBytes, totalBytes } = snapshot
  if (
    !Number.isSafeInteger(completedBytes) ||
    completedBytes < 0 ||
    totalBytes === undefined ||
    !Number.isSafeInteger(totalBytes) ||
    totalBytes <= 0
  ) {
    return null
  }
  return Math.min(Math.max(completedBytes / totalBytes, 0), 1)
}

export function sanitizeModelHubErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  const normalized = raw.trim() || 'Code Fusion Model Hub operation failed'
  const redacted = normalized
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/((?:api[_-]?key|token|authorization)=)[^&\s]+/gi, '$1[redacted]')
  return redacted.slice(0, MODEL_HUB_MAX_ERROR_MESSAGE_LENGTH)
}

function normalizeOptionalText(
  value: string | undefined,
  maximumLength: number,
  field: string
): string | undefined {
  if (value === undefined) return undefined
  const normalized = value.trim()
  if (!normalized) return undefined
  if (normalized.length > maximumLength) {
    throw new Error(`Code Fusion Model Hub ${field} is too long`)
  }
  if (hasControlCharacters(normalized)) {
    throw new Error(`Code Fusion Model Hub ${field} contains control characters`)
  }
  return normalized
}

function normalizeOpaqueIdentifier(
  value: string,
  maximumLength: number,
  field: string
): string {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error(`Code Fusion Model Hub ${field} cannot be empty`)
  }
  if (normalized.length > maximumLength) {
    throw new Error(`Code Fusion Model Hub ${field} is too long`)
  }
  if (hasControlCharacters(normalized)) {
    throw new Error(`Code Fusion Model Hub ${field} contains control characters`)
  }
  return normalized
}

function hasControlCharacters(value: string): boolean {
  return /[\u0000-\u001f\u007f]/.test(value)
}
