import { parentPort, workerData } from 'node:worker_threads'
import { OrchestrationLedgerService } from './orchestration-ledger-service'
import { executeOrchestrationLedgerWorkerRequest } from './orchestration-ledger-worker-execution'
import {
  isOrchestrationLedgerWorkerData,
  isOrchestrationLedgerWorkerRequest
} from './orchestration-ledger-worker-protocol'

const port = parentPort
if (!port) {
  throw new Error('Code Fusion orchestration ledger worker must run inside a Worker')
}
if (!isOrchestrationLedgerWorkerData(workerData)) {
  throw new Error('Code Fusion orchestration ledger worker received invalid worker data')
}

const service = new OrchestrationLedgerService(workerData.profileStorageDirectory)

port.on('message', (value: unknown) => {
  if (!isOrchestrationLedgerWorkerRequest(value)) return

  const response = executeOrchestrationLedgerWorkerRequest(service, value)
  port.postMessage(response)

  if (value.operation === 'close') {
    // SQLite close/checkpoint work completed on this worker before acknowledgement.
    // Close the port afterward so Electron's main thread never owns that synchronous work.
    setImmediate(() => port.close())
  }
})

process.once('exit', () => {
  // Worker-thread cleanup only. This never runs SQLite on Electron's main-thread quit barrier.
  service.close()
})
