import { describe, expect, it } from 'vitest'
import {
  MODEL_HUB_DEFAULT_PAGE_LIMIT,
  MODEL_HUB_MAX_ERROR_MESSAGE_LENGTH,
  availableModelHubDownloadActions,
  createModelHubDownloadRequest,
  isTerminalModelHubDownloadPhase,
  modelHubDownloadFraction,
  normalizeModelHubCatalogQuery,
  normalizeModelHubModelId,
  sanitizeModelHubErrorMessage
} from './model-hub-contract'

describe('Code Fusion Model Hub contract', () => {
  it('normalizes catalog defaults without manufacturing filters', () => {
    expect(normalizeModelHubCatalogQuery()).toEqual({
      sort: 'downloads',
      direction: 'descending',
      capabilities: [],
      limit: MODEL_HUB_DEFAULT_PAGE_LIMIT,
      includeGated: false
    })
  })

  it('trims query/cursor and de-duplicates capabilities in stable order', () => {
    expect(
      normalizeModelHubCatalogQuery({
        query: '  qwen  ',
        cursor: ' next-page ',
        sort: 'size',
        direction: 'ascending',
        capabilities: ['chat', 'vision', 'chat'],
        limit: 48,
        includeGated: true
      })
    ).toEqual({
      query: 'qwen',
      sort: 'size',
      direction: 'ascending',
      capabilities: ['chat', 'vision'],
      cursor: 'next-page',
      limit: 48,
      includeGated: true
    })
  })

  it('rejects unsafe catalog bounds and control characters', () => {
    expect(() => normalizeModelHubCatalogQuery({ limit: 0 })).toThrow('page limit')
    expect(() => normalizeModelHubCatalogQuery({ limit: 101 })).toThrow('page limit')
    expect(() => normalizeModelHubCatalogQuery({ limit: 1.5 })).toThrow('page limit')
    expect(() => normalizeModelHubCatalogQuery({ query: 'bad\u0000query' })).toThrow(
      'control characters'
    )
  })

  it('normalizes external model IDs without treating them as paths', () => {
    expect(normalizeModelHubModelId('  mlx-community/Qwen3-4B-4bit  ')).toBe(
      'mlx-community/Qwen3-4B-4bit'
    )
    expect(() => normalizeModelHubModelId(' ')).toThrow('cannot be empty')
    expect(() => normalizeModelHubModelId('x'.repeat(513))).toThrow('too long')
  })

  it('creates an opaque download request with no token or filesystem path', () => {
    expect(
      createModelHubDownloadRequest({
        requestId: ' request-1 ',
        modelId: ' mlx-community/model ',
        storageTargetId: ' external-cache-1 ',
        expectedBytes: 1_024
      })
    ).toEqual({
      requestId: 'request-1',
      modelId: 'mlx-community/model',
      storageTargetId: 'external-cache-1',
      expectedBytes: 1_024
    })
    expect(() =>
      createModelHubDownloadRequest({
        requestId: 'request-1',
        modelId: 'model',
        storageTargetId: 'cache',
        expectedBytes: 0
      })
    ).toThrow('positive safe integer')
  })

  it('defines terminal phases explicitly', () => {
    expect(isTerminalModelHubDownloadPhase('completed')).toBe(true)
    expect(isTerminalModelHubDownloadPhase('failed')).toBe(true)
    expect(isTerminalModelHubDownloadPhase('cancelled')).toBe(true)
    expect(isTerminalModelHubDownloadPhase('finalizing')).toBe(false)
  })

  it('derives legal download controls from phase and retryability', () => {
    expect(availableModelHubDownloadActions('downloading')).toEqual(['pause', 'cancel'])
    expect(availableModelHubDownloadActions('paused')).toEqual(['resume', 'cancel'])
    expect(availableModelHubDownloadActions('retrying')).toEqual(['cancel'])
    expect(availableModelHubDownloadActions('failed', true)).toEqual(['retry'])
    expect(availableModelHubDownloadActions('failed', false)).toEqual([])
    expect(availableModelHubDownloadActions('completed')).toEqual([])
  })

  it('derives bounded progress only from safe integer byte counts', () => {
    expect(modelHubDownloadFraction({ completedBytes: 25, totalBytes: 100 })).toBe(0.25)
    expect(modelHubDownloadFraction({ completedBytes: 150, totalBytes: 100 })).toBe(1)
    expect(modelHubDownloadFraction({ completedBytes: -1, totalBytes: 100 })).toBeNull()
    expect(modelHubDownloadFraction({ completedBytes: 1.5, totalBytes: 100 })).toBeNull()
    expect(modelHubDownloadFraction({ completedBytes: 10, totalBytes: 100.5 })).toBeNull()
    expect(modelHubDownloadFraction({ completedBytes: 10 })).toBeNull()
    expect(modelHubDownloadFraction({ completedBytes: 10, totalBytes: 0 })).toBeNull()
  })

  it('redacts credential-like values before applying the public length bound', () => {
    expect(
      sanitizeModelHubErrorMessage(
        new Error('Bearer secret token=abc api_key=xyz authorization=raw')
      )
    ).toBe('Bearer [redacted] token=[redacted] api_key=[redacted] authorization=[redacted]')

    const sanitized = sanitizeModelHubErrorMessage(
      `${'x'.repeat(MODEL_HUB_MAX_ERROR_MESSAGE_LENGTH - 20)} token=super-secret`
    )
    expect(sanitized).not.toContain('super-secret')
    expect(sanitized.length).toBeLessThanOrEqual(MODEL_HUB_MAX_ERROR_MESSAGE_LENGTH)
  })
})
