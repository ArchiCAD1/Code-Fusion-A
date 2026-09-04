#!/usr/bin/env node

import process from 'node:process'
import { pathToFileURL } from 'node:url'

const DEFAULT_BASE_URL = 'http://127.0.0.1:8080/'
const DEFAULT_TIMEOUT_MS = 5_000
const MAX_RESPONSE_BYTES = 1 * 1024 * 1024
const MAX_MODELS = 4_096
const MAX_MODEL_ID_LENGTH = 512

export async function verifyNativReadContract(options = {}) {
  const baseURL = normalizeLoopbackBaseURL(options.baseURL ?? DEFAULT_BASE_URL)
  const timeoutMs = normalizePositiveNumber(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, 'timeout')
  const apiKey = normalizeOptionalSecret(options.apiKey)
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  if (typeof fetchImpl !== 'function') throw new Error('Global fetch is unavailable')

  const startedAt = new Date().toISOString()
  const checks = []
  let modelCount = null

  for (const check of [
    { id: 'models', path: 'v1/models' },
    { id: 'health', path: 'health' },
    { id: 'metrics', path: 'metrics' }
  ]) {
    const started = performance.now()
    try {
      const payload = await fetchJsonBounded(
        fetchImpl,
        new URL(check.path, baseURL),
        apiKey,
        timeoutMs
      )
      if (check.id === 'models') modelCount = validateModelList(payload)
      checks.push({
        id: check.id,
        status: 'pass',
        durationMs: Math.max(0, Math.round(performance.now() - started)),
        detail: check.id === 'models' ? `${modelCount} models returned` : 'JSON response returned'
      })
    } catch (error) {
      checks.push({
        id: check.id,
        status: 'fail',
        durationMs: Math.max(0, Math.round(performance.now() - started)),
        detail: safeErrorMessage(error)
      })
    }
  }

  return {
    result: checks.every((check) => check.status === 'pass') ? 'pass' : 'fail',
    startedAt,
    completedAt: new Date().toISOString(),
    runtimeOrigin: baseURL.origin,
    modelCount,
    checks
  }
}

async function fetchJsonBounded(fetchImpl, url, apiKey, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(new Error('Nativ read-contract request timed out')),
    timeoutMs
  )
  timer.unref?.()

  try {
    const headers = new Headers({ Accept: 'application/json' })
    if (apiKey) headers.set('Authorization', `Bearer ${apiKey}`)
    const response = await fetchImpl(url, {
      method: 'GET',
      headers,
      cache: 'no-store',
      signal: controller.signal
    })
    const text = await readResponseTextBounded(response, MAX_RESPONSE_BYTES)
    if (!response.ok) throw new Error(`${url.pathname} returned HTTP ${response.status}`)
    try {
      return JSON.parse(text)
    } catch {
      throw new Error(`${url.pathname} returned malformed JSON`)
    }
  } finally {
    clearTimeout(timer)
  }
}

async function readResponseTextBounded(response, maxBytes) {
  const declaredLength = response.headers.get('content-length')
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength)
    if (Number.isFinite(parsedLength) && parsedLength > maxBytes) {
      await response.body?.cancel().catch(() => undefined)
      throw new Error('Nativ response exceeded the safe body-size limit')
    }
  }
  if (!response.body) return ''

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let total = 0
  let text = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
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

export function validateModelList(payload) {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw new Error('/v1/models returned an unexpected payload')
  }
  if (payload.data.length > MAX_MODELS) {
    throw new Error('/v1/models exceeded the safe entry limit')
  }

  const ids = new Set()
  for (const entry of payload.data) {
    if (!isRecord(entry) || typeof entry.id !== 'string') continue
    const id = entry.id.trim()
    if (!id || id.length > MAX_MODEL_ID_LENGTH) continue
    ids.add(id)
  }
  return ids.size
}

export function normalizeLoopbackBaseURL(value) {
  const url = new URL(String(value))
  const loopbackHosts = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])
  if (!['http:', 'https:'].includes(url.protocol) || !loopbackHosts.has(url.hostname)) {
    throw new Error('Nativ smoke endpoint must use a loopback HTTP(S) address')
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Nativ smoke base URL must be a clean loopback origin')
  }
  return url
}

function normalizeOptionalSecret(value) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return normalized || undefined
}

function normalizePositiveNumber(value, name) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${name} must be a positive finite number`)
  }
  return number
}

function safeErrorMessage(error) {
  const raw = error instanceof Error ? error.message : String(error)
  return (raw.trim() || 'Nativ read-contract check failed')
    .slice(0, 1_000)
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/((?:api[_-]?key|token|authorization)=)[^&\s]+/gi, '$1[redacted]')
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseArgs(argv) {
  const parsed = {
    baseURL: DEFAULT_BASE_URL,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    apiKeyEnv: 'NATIV_API_KEY'
  }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    const next = argv[index + 1]
    if (argument === '--base-url' && next) {
      parsed.baseURL = next
      index += 1
    } else if (argument === '--timeout-ms' && next) {
      parsed.timeoutMs = Number(next)
      index += 1
    } else if (argument === '--api-key-env' && next) {
      parsed.apiKeyEnv = next
      index += 1
    } else {
      throw new Error(`Unknown or incomplete argument: ${argument}`)
    }
  }
  return parsed
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const report = await verifyNativReadContract({
    baseURL: args.baseURL,
    timeoutMs: args.timeoutMs,
    apiKey: process.env[args.apiKeyEnv]
  })
  console.log(JSON.stringify(report, null, 2))
  if (report.result !== 'pass') process.exitCode = 1
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(safeErrorMessage(error))
    process.exitCode = 1
  })
}
