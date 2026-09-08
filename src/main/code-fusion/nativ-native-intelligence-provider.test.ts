import { afterEach, describe, expect, it } from 'vitest'

import { setMainHttpClient, type MainHttpClient } from '../network/http-client'
import { NativNativeIntelligenceProvider } from './nativ-native-intelligence-provider'

type RecordedRequest = {
  url: string
  init: RequestInit | undefined
}

function makeHttpClient(
  handler: (url: string, init?: RequestInit) => Promise<Response>,
  requests: RecordedRequest[] = []
): { client: MainHttpClient; requests: RecordedRequest[] } {
  return {
    client: {
      fetch: async (url, init) => {
        requests.push({ url, init })
        return handler(url, init)
      },
      proxySession: () => null
    },
    requests
  }
}

afterEach(() => {
  setMainHttpClient(null)
})

describe('NativNativeIntelligenceProvider', () => {
  it('uses the public model endpoint as a read-only readiness probe', async () => {
    const { client, requests } = makeHttpClient(async () => Response.json({ data: [] }))
    const provider = new NativNativeIntelligenceProvider({ httpClient: client })

    const health = await provider.getHealth()

    expect(health.state).toBe('ready')
    expect(health.protocolVersion).toBe(1)
    expect(health.capabilities).toContain('chat')
    expect(health.capabilities).not.toContain('model-downloads')
    expect(requests).toHaveLength(1)
    expect(requests[0]?.url).toBe('http://127.0.0.1:8080/v1/models')
    expect(requests[0]?.init?.method).toBe('GET')
  })

  it('resolves the active host HTTP client at request time when no override is injected', async () => {
    const first = makeHttpClient(async () => Response.json({ data: [{ id: 'old/model' }] }))
    const second = makeHttpClient(async () => Response.json({ data: [{ id: 'current/model' }] }))
    setMainHttpClient(first.client)
    const provider = new NativNativeIntelligenceProvider()

    setMainHttpClient(second.client)
    const models = await provider.listModels()

    expect(first.requests).toHaveLength(0)
    expect(second.requests).toHaveLength(1)
    expect(models.map((model) => model.id)).toEqual(['current/model'])
  })

  it('applies an optional bearer token without putting it in the URL', async () => {
    const { client, requests } = makeHttpClient(async () =>
      Response.json({ data: [{ id: 'mlx-community/Qwen3.5-9B-4bit' }] })
    )
    const provider = new NativNativeIntelligenceProvider({
      httpClient: client,
      apiKey: ' local-secret '
    })

    const models = await provider.listModels()

    const headers = new Headers(requests[0]?.init?.headers)
    expect(headers.get('Authorization')).toBe('Bearer local-secret')
    expect(requests[0]?.url).not.toContain('local-secret')
    expect(models).toEqual([
      {
        id: 'mlx-community/Qwen3.5-9B-4bit',
        displayName: 'Qwen3.5-9B-4bit',
        source: 'local-cache',
        state: 'installed',
        capabilities: ['chat']
      }
    ])
  })

  it('reports a network failure as unavailable instead of inventing runtime success', async () => {
    const { client } = makeHttpClient(async () => {
      throw new Error('connection refused')
    })
    const provider = new NativNativeIntelligenceProvider({ httpClient: client })

    const health = await provider.getHealth()

    expect(health.state).toBe('unavailable')
    expect(health.message).toContain('connection refused')
  })

  it('redacts bearer and query-style credentials from health failures', async () => {
    const { client } = makeHttpClient(async () => {
      throw new Error('Bearer local-secret token=abc api_key=xyz authorization=raw')
    })
    const provider = new NativNativeIntelligenceProvider({ httpClient: client })

    const health = await provider.getHealth()

    expect(health.state).toBe('unavailable')
    expect(health.message).toBe(
      'Bearer [redacted] token=[redacted] api_key=[redacted] authorization=[redacted]'
    )
  })

  it('reports a reachable non-2xx runtime as degraded', async () => {
    const { client } = makeHttpClient(async () => new Response('busy', { status: 503 }))
    const provider = new NativNativeIntelligenceProvider({ httpClient: client })

    const health = await provider.getHealth()

    expect(health.state).toBe('degraded')
    expect(health.message).toBe('Nativ readiness returned HTTP 503')
  })

  it('rejects model inventory failures after consuming the response', async () => {
    const { client } = makeHttpClient(async () => new Response('not ready', { status: 503 }))
    const provider = new NativNativeIntelligenceProvider({ httpClient: client })

    await expect(provider.listModels()).rejects.toThrow(
      'Nativ model inventory request failed with HTTP 503'
    )
  })

  it('rejects declared response bodies above the safe byte limit', async () => {
    const { client } = makeHttpClient(
      async () =>
        new Response('small', {
          status: 200,
          headers: { 'content-length': String(1 * 1024 * 1024 + 1) }
        })
    )
    const provider = new NativNativeIntelligenceProvider({ httpClient: client })

    await expect(provider.listModels()).rejects.toThrow(
      'Nativ response exceeded the safe body-size limit'
    )
  })

  it('rejects streamed response bodies above the safe byte limit', async () => {
    const { client } = makeHttpClient(
      async () => new Response('x'.repeat(1 * 1024 * 1024 + 1), { status: 200 })
    )
    const provider = new NativNativeIntelligenceProvider({ httpClient: client })

    await expect(provider.listModels()).rejects.toThrow(
      'Nativ response exceeded the safe body-size limit'
    )
  })

  it('rejects malformed model inventory payloads', async () => {
    const { client } = makeHttpClient(async () => new Response('{broken', { status: 200 }))
    const provider = new NativNativeIntelligenceProvider({ httpClient: client })

    await expect(provider.listModels()).rejects.toThrow(
      'Nativ model inventory returned malformed JSON'
    )
  })

  it('rejects model inventories above the safe entry limit', async () => {
    const { client } = makeHttpClient(async () =>
      Response.json({
        data: Array.from({ length: 4_097 }, (_, index) => ({ id: `local/model-${index}` }))
      })
    )
    const provider = new NativNativeIntelligenceProvider({ httpClient: client })

    await expect(provider.listModels()).rejects.toThrow(
      'Nativ model inventory exceeded the safe entry limit'
    )
  })

  it('deduplicates identifiers and ignores malformed or oversized entries', async () => {
    const { client } = makeHttpClient(async () =>
      Response.json({
        data: [
          { id: '' },
          { id: 42 },
          null,
          { id: 'local/model-a' },
          { id: ' local/model-a ' },
          { id: 'x'.repeat(513) },
          { id: 'model-b' }
        ]
      })
    )
    const provider = new NativNativeIntelligenceProvider({ httpClient: client })

    const models = await provider.listModels()

    expect(models.map((model) => model.id)).toEqual(['local/model-a', 'model-b'])
  })

  it('refuses non-loopback endpoints in the first bridge version', () => {
    expect(
      () => new NativNativeIntelligenceProvider({ baseURL: 'https://example.com/' })
    ).toThrow('Native intelligence endpoint must use a loopback HTTP(S) address')
  })
})
