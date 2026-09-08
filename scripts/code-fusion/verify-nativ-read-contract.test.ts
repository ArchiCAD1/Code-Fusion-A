import { describe, expect, it, vi } from 'vitest'
import {
  normalizeLoopbackBaseURL,
  validateModelList,
  verifyNativReadContract
} from './verify-nativ-read-contract.mjs'

describe('verify-nativ-read-contract', () => {
  it('accepts only a clean loopback origin', () => {
    expect(normalizeLoopbackBaseURL('http://127.0.0.1:8080/').origin).toBe(
      'http://127.0.0.1:8080'
    )
    expect(normalizeLoopbackBaseURL('http://localhost:8080/').hostname).toBe('localhost')
    expect(() => normalizeLoopbackBaseURL('https://example.com/')).toThrow('loopback')
    expect(() => normalizeLoopbackBaseURL('http://127.0.0.1:8080/v1')).toThrow(
      'clean loopback origin'
    )
  })

  it('counts unique bounded model identifiers', () => {
    expect(
      validateModelList({
        data: [
          { id: 'local/model-a' },
          { id: ' local/model-a ' },
          { id: 'model-b' },
          { id: '' },
          { id: 42 },
          { id: 'x'.repeat(513) }
        ]
      })
    ).toBe(2)
  })

  it('rejects malformed and oversized model inventories', () => {
    expect(() => validateModelList({ models: [] })).toThrow('unexpected payload')
    expect(() =>
      validateModelList({
        data: Array.from({ length: 4_097 }, (_, index) => ({ id: `model-${index}` }))
      })
    ).toThrow('safe entry limit')
  })

  it('verifies models, health and metrics without exposing the API key', async () => {
    const requests: Array<{ url: string; authorization: string | null }> = []
    const fetchImpl = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = new URL(String(input))
      requests.push({
        url: url.toString(),
        authorization: new Headers(init?.headers).get('Authorization')
      })
      if (url.pathname === '/v1/models') {
        return Response.json({ data: [{ id: 'model-a' }, { id: 'model-b' }] })
      }
      return Response.json({ status: 'ok' })
    })

    const report = await verifyNativReadContract({
      baseURL: 'http://127.0.0.1:8080/',
      apiKey: 'local-secret',
      fetchImpl
    })

    expect(report.result).toBe('pass')
    expect(report.modelCount).toBe(2)
    expect(report.checks.map((check) => check.id)).toEqual(['models', 'health', 'metrics'])
    expect(report.checks.every((check) => check.status === 'pass')).toBe(true)
    expect(requests).toHaveLength(3)
    expect(requests.every((request) => request.authorization === 'Bearer local-secret')).toBe(true)
    expect(JSON.stringify(report)).not.toContain('local-secret')
  })

  it('reports endpoint failures independently and redacts credentials', async () => {
    const fetchImpl = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input))
      if (url.pathname === '/health') {
        throw new Error('Bearer secret token=abc api_key=xyz authorization=raw')
      }
      if (url.pathname === '/metrics') {
        return new Response('busy', { status: 503 })
      }
      return Response.json({ data: [] })
    })

    const report = await verifyNativReadContract({ fetchImpl })

    expect(report.result).toBe('fail')
    expect(report.modelCount).toBe(0)
    expect(report.checks[0]).toMatchObject({ id: 'models', status: 'pass' })
    expect(report.checks[1]).toMatchObject({
      id: 'health',
      status: 'fail',
      detail: 'Bearer [redacted] token=[redacted] api_key=[redacted] authorization=[redacted]'
    })
    expect(report.checks[2]).toMatchObject({
      id: 'metrics',
      status: 'fail',
      detail: '/metrics returned HTTP 503'
    })
  })

  it('rejects an oversized chunked response', async () => {
    const fetchImpl = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input))
      if (url.pathname === '/v1/models') {
        return new Response('x'.repeat(1 * 1024 * 1024 + 1))
      }
      return Response.json({ status: 'ok' })
    })

    const report = await verifyNativReadContract({ fetchImpl })

    expect(report.result).toBe('fail')
    expect(report.checks[0]).toMatchObject({
      id: 'models',
      status: 'fail',
      detail: 'Nativ response exceeded the safe body-size limit'
    })
  })
})
