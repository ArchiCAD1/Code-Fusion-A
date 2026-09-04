import { join, sep } from 'node:path'
import type { Worker } from 'node:worker_threads'
import { describe, expect, it, vi } from 'vitest'
import {
  ORCHESTRATION_LEDGER_WORKER_ENTRY_FILENAME,
  createOrchestrationLedgerWorkerFactory,
  resolveOrchestrationLedgerWorkerEntryPath
} from './orchestration-ledger-worker-factory'

describe('resolveOrchestrationLedgerWorkerEntryPath', () => {
  it('resolves the development entry beside the emitted main module', () => {
    expect(
      resolveOrchestrationLedgerWorkerEntryPath({
        isPackaged: false,
        resourcesPath: undefined,
        moduleDir: join(sep, 'tmp', 'out', 'main')
      })
    ).toBe(join(sep, 'tmp', 'out', 'main', ORCHESTRATION_LEDGER_WORKER_ENTRY_FILENAME))
  })

  it('resolves the packaged entry through resourcesPath/app.asar/out/main', () => {
    const resourcesPath = join(sep, 'Applications', 'Code Fusion.app', 'Contents', 'Resources')
    expect(
      resolveOrchestrationLedgerWorkerEntryPath({
        isPackaged: true,
        resourcesPath,
        moduleDir: join(sep, 'tmp', 'out', 'main')
      })
    ).toBe(
      join(
        resourcesPath,
        'app.asar',
        'out',
        'main',
        ORCHESTRATION_LEDGER_WORKER_ENTRY_FILENAME
      )
    )
  })

  it('falls back to the module directory when a non-Electron host has no resourcesPath', () => {
    expect(
      resolveOrchestrationLedgerWorkerEntryPath({
        isPackaged: true,
        resourcesPath: undefined,
        moduleDir: join(sep, 'tmp', 'out', 'main')
      })
    ).toBe(join(sep, 'tmp', 'out', 'main', ORCHESTRATION_LEDGER_WORKER_ENTRY_FILENAME))
  })
})

describe('createOrchestrationLedgerWorkerFactory', () => {
  it('passes only the profile directory through workerData', () => {
    const createWorker = vi.fn(() => ({}) as Worker)
    const moduleDir = join(sep, 'tmp', 'out', 'main')
    const expectedPath = join(moduleDir, ORCHESTRATION_LEDGER_WORKER_ENTRY_FILENAME)
    const factory = createOrchestrationLedgerWorkerFactory({
      getLayout: () => ({ isPackaged: false, resourcesPath: undefined, moduleDir }),
      fileExists: () => true,
      createWorker
    })

    expect(factory('/tmp/profile')).toEqual({})
    expect(createWorker).toHaveBeenCalledWith(expectedPath, {
      workerData: { profileStorageDirectory: '/tmp/profile' }
    })
  })

  it('fails closed when the separately emitted worker entry is absent', () => {
    const createWorker = vi.fn(() => ({}) as Worker)
    const factory = createOrchestrationLedgerWorkerFactory({
      getLayout: () => ({
        isPackaged: false,
        resourcesPath: undefined,
        moduleDir: join(sep, 'tmp', 'out', 'main')
      }),
      fileExists: () => false,
      createWorker
    })

    expect(() => factory('/tmp/profile')).toThrow('worker entry not found')
    expect(createWorker).not.toHaveBeenCalled()
  })
})
