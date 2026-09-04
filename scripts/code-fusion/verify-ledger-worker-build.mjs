#!/usr/bin/env node

import { existsSync } from 'node:fs'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { Worker } from 'node:worker_threads'

const PROTOCOL_VERSION = 1
const REQUEST_TIMEOUT_MS = 15_000
const entryPath = resolve(
  process.argv[2] ?? 'out/main/orchestration-ledger-worker-entry.js'
)

if (!existsSync(entryPath)) {
  console.error(`Ledger worker entry not found: ${entryPath}`)
  process.exit(2)
}

const profileDirectory = await mkdtemp(join(tmpdir(), 'code-fusion-ledger-worker-'))
const worker = new Worker(entryPath, {
  workerData: { profileStorageDirectory: profileDirectory }
})
let nextId = 1
let terminated = false

try {
  const schemaVersion = await request('getSchemaVersion', null)
  assert(schemaVersion === 1, `Expected schema version 1; received ${String(schemaVersion)}`)

  const eventId = `worker-smoke-${Date.now()}`
  const aggregateId = 'worker-smoke-task'
  const record = await request('appendCore', {
    event: {
      eventId,
      occurredAt: new Date().toISOString(),
      projectId: 'code-fusion-worker-smoke',
      aggregateId,
      eventType: 'task.created',
      payload: { title: 'Ledger worker build smoke' },
      actor: { kind: 'system', id: 'worker-build-smoke' },
      source: 'scripts/code-fusion/verify-ledger-worker-build.mjs'
    }
  })
  assert(isRecord(record), 'Append did not return a record')
  assert(record.eventId === eventId, 'Append returned the wrong event ID')
  assert(record.aggregateType === 'task', 'Core event aggregate ownership was not enforced')
  assert(Number.isSafeInteger(record.sequence), 'Append did not return a sequence number')

  const records = await request('readAggregate', {
    aggregateType: 'task',
    aggregateId,
    options: { limit: 10 }
  })
  assert(Array.isArray(records), 'Aggregate read did not return an array')
  assert(records.length === 1, `Expected one persisted record; received ${records.length}`)
  assert(records[0]?.eventId === eventId, 'Aggregate read returned the wrong event')

  const latestSequence = await request('getLatestSequence', null)
  assert(latestSequence === record.sequence, 'Latest sequence does not match the appended record')

  await request('close', null)
  const ledgerStat = await stat(join(profileDirectory, 'code-fusion-ledger.sqlite3'))
  assert(ledgerStat.isFile() && ledgerStat.size > 0, 'SQLite ledger file was not durably created')

  console.log(
    JSON.stringify(
      {
        result: 'pass',
        workerEntry: entryPath,
        schemaVersion,
        latestSequence,
        persistedRecords: records.length
      },
      null,
      2
    )
  )
} catch (error) {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
} finally {
  if (!terminated) {
    terminated = true
    await worker.terminate().catch(() => undefined)
  }
  await rm(profileDirectory, { recursive: true, force: true }).catch(() => undefined)
}

function request(operation, payload) {
  return new Promise((resolveRequest, rejectRequest) => {
    const id = nextId++
    const timer = setTimeout(() => {
      cleanup()
      rejectRequest(new Error(`Ledger worker smoke timed out during ${operation}`))
    }, REQUEST_TIMEOUT_MS)
    timer.unref?.()

    const onMessage = (response) => {
      if (!isRecord(response) || response.id !== id || response.operation !== operation) return
      cleanup()
      if (response.ok === true) {
        resolveRequest(response.result)
        return
      }
      const message = isRecord(response.error) ? String(response.error.message ?? 'failed') : 'failed'
      rejectRequest(new Error(`Ledger worker ${operation} failed: ${message}`))
    }
    const onError = (error) => {
      cleanup()
      rejectRequest(error)
    }
    const onExit = (code) => {
      if (operation === 'close' && code === 0) return
      cleanup()
      rejectRequest(new Error(`Ledger worker exited with code ${code} during ${operation}`))
    }
    const cleanup = () => {
      clearTimeout(timer)
      worker.off('message', onMessage)
      worker.off('error', onError)
      worker.off('exit', onExit)
    }

    worker.on('message', onMessage)
    worker.on('error', onError)
    worker.on('exit', onExit)
    worker.postMessage({ protocolVersion: PROTOCOL_VERSION, id, operation, payload })
  })
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
