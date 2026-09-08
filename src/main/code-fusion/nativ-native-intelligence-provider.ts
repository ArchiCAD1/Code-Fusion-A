import {
  NATIVE_INTELLIGENCE_PROTOCOL_VERSION,
  type NativeIntelligenceCapability,
  type NativeIntelligenceHealth,
  type NativeIntelligenceProvider,
  type NativeIntelligenceRequestOptions,
  type NativeModelDescriptor
} from '../../shared/code-fusion/native-intelligence-contract'
import { getMainHttpClient, type MainHttpClient } from '../network/http-client'

const DEFAULT_NATIV_BASE_URL = 'http://127.0.0.1:8080/'
const DEFAULT_TIMEOUT_MS = 3_000
const MAX_RESPONSE_BODY_BYTES = 1 * 1024 * 1024
const MAX_MODEL_INVENTORY_ENTRIES = 4_096
const MAX_MODEL_ID_LENGTH = 512
const MAX_ERROR_MESSAGE_LENGTH = 1_000

const READ_ONLY_CAPABILITIES: readonly NativeIntelligenceCapability[] = [
  'chat',
  'responses',
  'vision',
  'images',
  'audio',
  'embeddings',
  'system-metrics'
]

type OpenAiModelEntry = {
  id: string
}

type TextResponse = {
  response: Response
  body: string
}

export type NativNativeIntelligenceProviderOptions = {
  baseURL?: string | URL
  apiKey?: string
  timeoutMs?: number
  httpClient?: MainHttpClient
}

export class NativNativeIntelligenceProvider implements NativeIntelligenceProvider {
  private readonly baseURL: URL
  private readonly apiKey: string | undefined
  private readonly timeoutMs: number
  private readonly httpClientOverride: MainHttpClient | undefined

  constructor(options: NativNativeIntelligenceProviderOptions = {}) {
    this.baseURL = normalizeLoopbackBaseURL(options.baseURL ?? DEFAULT_NATIV_BASE_URL)
    this.apiKey = normalizeOptionalSecret(options.apiKey)
    this.timeoutMs = normalizeTimeout(options.timeoutMs)
    this.httpClientOverride = options.httpClient
  }

  async getHealth(
    options: NativeIntelligenceRequestOptions = {}
  ): Promise<NativeIntelligenceHealth> {
    try {
      const { response } = await this.requestText('v1/models', options)
      if (!response.ok) {
        return this.health('degraded', `Nativ readiness returned HTTP ${response.status}`)
      }
      return this.health('ready')
    } catch (error) {
      if (options.signal?.aborted) {
        throw error
      }
      return this.health('unavailable', safeErrorMessage(error))
    }
  }

  async listModels(
    options: NativeIntelligenceRequestOptions = {}
  ): Promise<readonly NativeModelDescriptor[]> {
    const { response, body } = await this.requestText('v1/models', options)
    if (!response.ok) {
      throw new Error(`Nativ model inventory request failed with HTTP ${response.status}`)
    }

    const entries = parseOpenAiModelList(body)
    return entries.map(
      (entry): NativeModelDescriptor => ({
        id: entry.id,
        displayName: modelDisplayName(entry.id),
        source: 'local-cache',
        state: 'installed',
        capabilities: ['chat']
      })
    )
  }

  private health(
    state: NativeIntelligenceHealth['state'],
    message?: string
  ): NativeIntelligenceHealth {
    return {
      protocolVersion: NATIVE_INTELLIGENCE_PROTOCOL_VERSION,
      state,
      runtimeName: 'Nativ-compatible local runtime',
      capabilities: READ_ONLY_CAPABILITIES,
      ...(message ? { message } : {})
    }
  }

  private async requestText(
    path: string,
    options: NativeIntelligenceRequestOptions
  ): Promise<TextResponse> {
    const requestURL = new URL(path, this.baseURL).toString()
    const headers = new Headers()
    if (this.apiKey) {
      headers.set('Authorization', `Bearer ${this.apiKey}`)
    }

    const requestAbort = createRequestAbort(options.signal, this.timeoutMs)
    try {
      // Resolve the host port at request time so a provider created before Electron's
      // Chromium-backed client is installed cannot retain the Node fallback forever.
      const httpClient = this.httpClientOverride ?? getMainHttpClient()
      const response = await httpClient.fetch(requestURL, {
        method: 'GET',
        headers,
        cache: 'no-store',
        signal: requestAbort.signal
      })
      const body = await readResponseTextBounded(response, MAX_RESPONSE_BODY_BYTES)
      return { response, body }
    } finally {
      requestAbort.cleanup()
    }
  }
}

function normalizeLoopbackBaseURL(value: string | URL): URL {
  const url = new URL(value.toString())
  const loopbackHosts = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])
  if (!['http:', 'https:'].includes(url.protocol) || !loopbackHosts.has(url.hostname)) {
    throw new Error('Native intelligence endpoint must use a loopback HTTP(S) address')
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Native intelligence base URL must be a clean loopback origin')
  }
  return url
}

function normalizeOptionalSecret(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function normalizeTimeout(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_TIMEOUT_MS
  }
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Native intelligence timeout must be a positive finite number')
  }
  return value
}

function createRequestAbort(
  externalSignal: AbortSignal | undefined,
  timeoutMs: number
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController()
  const forwardAbort = (): void => controller.abort(externalSignal?.reason)

  if (externalSignal?.aborted) {
    forwardAbort()
  } else {
    externalSignal?.addEventListener('abort', forwardAbort, { once: true })
  }

  const timeout = setTimeout(
    () => controller.abort(new Error('Native intelligence request timed out')),
    timeoutMs
  )
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout)
      externalSignal?.removeEventListener('abort', forwardAbort)
    }
  }
}

async function readResponseTextBounded(response: Response, maxBytes: number): Promise<string> {
  const declaredLength = response.headers.get('content-length')
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength)
    if (Number.isFinite(parsedLength) && parsedLength > maxBytes) {
      await cancelResponseBody(response)
      throw new Error('Nativ response exceeded the safe body-size limit')
    }
  }

  if (!response.body) {
    return ''
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let totalBytes = 0
  let text = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined)
        throw new Error('Nativ response exceeded the safe body-size limit')
      }
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
    return text
  } finally {
    reader.releaseLock()
  }
}

async function cancelResponseBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel()
  } catch {
    // Best-effort cancellation only. The caller still fails closed on the declared size.
  }
}

function parseOpenAiModelList(body: string): readonly OpenAiModelEntry[] {
  let payload: unknown
  try {
    payload = JSON.parse(body)
  } catch {
    throw new Error('Nativ model inventory returned malformed JSON')
  }

  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw new Error('Nativ model inventory returned an unexpected payload')
  }
  if (payload.data.length > MAX_MODEL_INVENTORY_ENTRIES) {
    throw new Error('Nativ model inventory exceeded the safe entry limit')
  }

  const models: OpenAiModelEntry[] = []
  const seenModelIds = new Set<string>()
  for (const candidate of payload.data) {
    if (!isRecord(candidate) || typeof candidate.id !== 'string') {
      continue
    }
    const id = candidate.id.trim()
    if (!id || id.length > MAX_MODEL_ID_LENGTH || seenModelIds.has(id)) {
      continue
    }
    seenModelIds.add(id)
    models.push({ id })
  }
  return models
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function modelDisplayName(modelId: string): string {
  const segments = modelId.split('/').filter(Boolean)
  return segments.at(-1) ?? modelId
}

function safeErrorMessage(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String(error)
  const normalized = rawMessage.trim() || 'Native intelligence runtime is unavailable'
  return normalized
    .slice(0, MAX_ERROR_MESSAGE_LENGTH)
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/((?:api[_-]?key|token|authorization)=)[^&\s]+/gi, '$1[redacted]')
}
