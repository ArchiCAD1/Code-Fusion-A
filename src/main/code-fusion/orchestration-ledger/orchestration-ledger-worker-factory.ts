import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { Worker, type WorkerOptions } from 'node:worker_threads'
import { getAppEnvironment, hasAppEnvironment } from '../../../shared/app-environment'
import type { OrchestrationLedgerWorkerFactory } from './orchestration-ledger-worker-client'
import type { OrchestrationLedgerWorkerData } from './orchestration-ledger-worker-protocol'

export const ORCHESTRATION_LEDGER_WORKER_ENTRY_FILENAME =
  'orchestration-ledger-worker-entry.js'

export type OrchestrationLedgerWorkerEntryLayout = {
  isPackaged: boolean
  /** Undefined outside Electron: `process.resourcesPath` is Electron-specific. */
  resourcesPath: string | undefined
  moduleDir: string
}

export type OrchestrationLedgerWorkerFactoryDependencies = {
  getLayout?: () => OrchestrationLedgerWorkerEntryLayout
  fileExists?: (path: string) => boolean
  createWorker?: (path: string, options: WorkerOptions) => Worker
}

/**
 * Resolve the separately emitted CommonJS worker entry for development or packaged Electron.
 *
 * The packaged path mirrors Code Fusion's existing port-scan worker convention. A packaged smoke
 * test remains mandatory because loading a Worker entry through Electron's asar shim is a runtime
 * property, not something source inspection can certify.
 */
export function resolveOrchestrationLedgerWorkerEntryPath(
  layout: OrchestrationLedgerWorkerEntryLayout
): string {
  if (layout.isPackaged && layout.resourcesPath) {
    return join(
      layout.resourcesPath,
      'app.asar',
      'out',
      'main',
      ORCHESTRATION_LEDGER_WORKER_ENTRY_FILENAME
    )
  }
  return join(layout.moduleDir, ORCHESTRATION_LEDGER_WORKER_ENTRY_FILENAME)
}

/**
 * Create the production worker factory without coupling the worker client to Electron path rules.
 * Missing build output fails synchronously and closed; SQLite work is never moved back to the main
 * thread as a fallback.
 */
export function createOrchestrationLedgerWorkerFactory(
  dependencies: OrchestrationLedgerWorkerFactoryDependencies = {}
): OrchestrationLedgerWorkerFactory {
  const getLayout = dependencies.getLayout ?? currentWorkerEntryLayout
  const fileExists = dependencies.fileExists ?? existsSync
  const createWorker = dependencies.createWorker ?? ((path, options) => new Worker(path, options))

  return (profileStorageDirectory: string): Worker => {
    const workerPath = resolveOrchestrationLedgerWorkerEntryPath(getLayout())
    if (!fileExists(workerPath)) {
      throw new Error(`Code Fusion orchestration ledger worker entry not found: ${workerPath}`)
    }

    const workerData: OrchestrationLedgerWorkerData = { profileStorageDirectory }
    return createWorker(workerPath, { workerData })
  }
}

function currentWorkerEntryLayout(): OrchestrationLedgerWorkerEntryLayout {
  return {
    isPackaged: hasAppEnvironment() && getAppEnvironment().isPackaged(),
    resourcesPath: process.resourcesPath,
    moduleDir: __dirname
  }
}
