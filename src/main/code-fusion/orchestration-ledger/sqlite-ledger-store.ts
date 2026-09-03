import { byteLength } from 'node:buffer'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import {
  ORCHESTRATION_LEDGER_AGGREGATE_TYPES,
  ORCHESTRATION_LEDGER_SCHEMA_VERSION,
  type JsonValue,
  type OrchestrationLedgerActorKind,
  type OrchestrationLedgerAggregateType,
  type OrchestrationLedgerEventInput,
  type OrchestrationLedgerReadOptions,
  type OrchestrationLedgerRecord,
  type OrchestrationLedgerStore
} from '../../../shared/code-fusion/orchestration-ledger'
import { hardenExistingSecureFile } from '../../../shared/secure-file'

const DEFAULT_READ_LIMIT = 100
const MAX_READ_LIMIT = 1_000
const MAX_BATCH_SIZE = 10_000
const MAX_ID_LENGTH = 512
const MAX_EVENT_TYPE_LENGTH = 256
const MAX_SOURCE_LENGTH = 256
const MAX_PAYLOAD_BYTES = 2 * 1024 * 1024
const MAX_PAYLOAD_DEPTH = 64
const AGGREGATE_TYPES = new Set<string>(ORCHESTRATION_LEDGER_AGGREGATE_TYPES)
const ACTOR_KINDS = new Set<OrchestrationLedgerActorKind>([
  'human',
  'agent',
  'system',
  'external'
])

type LedgerRow = {
  sequence: number
  event_id: string
  occurred_at: string
  project_id: string | null
  aggregate_type: OrchestrationLedgerAggregateType
  aggregate_id: string
  event_type: string
  payload_json: string
  actor_kind: OrchestrationLedgerActorKind | null
  actor_id: string | null
  source: string | null
  correlation_id: string | null
  causation_id: string | null
}

type SerializedEvent = {
  event: OrchestrationLedgerEventInput
  payloadJson: string
}

/**
 * Local append-only Code Fusion orchestration ledger backed by Node's built-in SQLite.
 *
 * The store is intentionally main-process/backend only and is not wired into renderer state yet.
 * A future service boundary can move synchronous SQLite work off the main thread without changing
 * the shared ledger contract.
 */
export class SqliteOrchestrationLedgerStore implements OrchestrationLedgerStore {
  private readonly database: DatabaseSync
  private closed = false

  constructor(path: string) {
    if (path !== ':memory:') {
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    }
    this.database = new DatabaseSync(path, { timeout: 5_000 })
    try {
      this.configureDatabase(path)
      this.migrate()
    } catch (error) {
      this.database.close()
      this.closed = true
      throw error
    }
  }

  getSchemaVersion(): number {
    this.assertOpen()
    const row = this.database.prepare('PRAGMA user_version').get() as
      | { user_version?: number }
      | undefined
    return row?.user_version ?? 0
  }

  getLatestSequence(): number {
    this.assertOpen()
    const row = this.database
      .prepare('SELECT COALESCE(MAX(sequence), 0) AS sequence FROM code_fusion_ledger_events')
      .get() as { sequence: number }
    return row.sequence
  }

  append(event: OrchestrationLedgerEventInput): OrchestrationLedgerRecord {
    const [record] = this.appendMany([event])
    if (!record) {
      throw new Error('Code Fusion ledger append did not produce a record')
    }
    return record
  }

  appendMany(
    events: readonly OrchestrationLedgerEventInput[]
  ): readonly OrchestrationLedgerRecord[] {
    this.assertOpen()
    if (events.length === 0) {
      return []
    }
    if (events.length > MAX_BATCH_SIZE) {
      throw new Error(`Code Fusion ledger batch must not exceed ${MAX_BATCH_SIZE} events`)
    }

    // Validate and serialize the complete batch before opening a transaction so malformed evidence
    // cannot leave a partial write or hold a database write lock while validation runs.
    const serialized = events.map(serializeEvent)
    const insert = this.database.prepare(`
      INSERT INTO code_fusion_ledger_events (
        event_id, occurred_at, project_id, aggregate_type, aggregate_id, event_type,
        payload_json, actor_kind, actor_id, source, correlation_id, causation_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const records: OrchestrationLedgerRecord[] = []

    this.database.exec('BEGIN IMMEDIATE')
    try {
      for (const item of serialized) {
        const event = item.event
        const result = insert.run(
          event.eventId,
          event.occurredAt,
          event.projectId ?? null,
          event.aggregateType,
          event.aggregateId,
          event.eventType,
          item.payloadJson,
          event.actor?.kind ?? null,
          event.actor?.id ?? null,
          event.source ?? null,
          event.correlationId ?? null,
          event.causationId ?? null
        )
        const sequence = Number(result.lastInsertRowid)
        if (!Number.isSafeInteger(sequence) || sequence <= 0) {
          throw new Error('Code Fusion ledger produced an invalid event sequence')
        }
        records.push({ ...event, sequence })
      }
      this.database.exec('COMMIT')
      return records
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  readAfter(options: OrchestrationLedgerReadOptions = {}): readonly OrchestrationLedgerRecord[] {
    this.assertOpen()
    const { afterSequence, limit } = normalizeReadOptions(options)
    const rows = this.database
      .prepare(`
        SELECT * FROM code_fusion_ledger_events
        WHERE sequence > ?
        ORDER BY sequence ASC
        LIMIT ?
      `)
      .all(afterSequence, limit) as unknown as LedgerRow[]
    return rows.map(rowToRecord)
  }

  readAggregate(
    aggregateType: OrchestrationLedgerAggregateType,
    aggregateId: string,
    options: OrchestrationLedgerReadOptions = {}
  ): readonly OrchestrationLedgerRecord[] {
    this.assertOpen()
    const normalizedAggregateType = requireAggregateType(aggregateType)
    const normalizedAggregateId = requireText('aggregateId', aggregateId, MAX_ID_LENGTH)
    const { afterSequence, limit } = normalizeReadOptions(options)
    const rows = this.database
      .prepare(`
        SELECT * FROM code_fusion_ledger_events
        WHERE aggregate_type = ? AND aggregate_id = ? AND sequence > ?
        ORDER BY sequence ASC
        LIMIT ?
      `)
      .all(normalizedAggregateType, normalizedAggregateId, afterSequence, limit) as unknown as LedgerRow[]
    return rows.map(rowToRecord)
  }

  readProject(
    projectId: string,
    options: OrchestrationLedgerReadOptions = {}
  ): readonly OrchestrationLedgerRecord[] {
    this.assertOpen()
    const normalizedProjectId = requireText('projectId', projectId, MAX_ID_LENGTH)
    const { afterSequence, limit } = normalizeReadOptions(options)
    const rows = this.database
      .prepare(`
        SELECT * FROM code_fusion_ledger_events
        WHERE project_id = ? AND sequence > ?
        ORDER BY sequence ASC
        LIMIT ?
      `)
      .all(normalizedProjectId, afterSequence, limit) as unknown as LedgerRow[]
    return rows.map(rowToRecord)
  }

  close(): void {
    if (this.closed) {
      return
    }
    this.database.close()
    this.closed = true
  }

  private configureDatabase(path: string): void {
    this.database.exec('PRAGMA foreign_keys = ON')
    this.database.exec('PRAGMA busy_timeout = 5000')
    if (path !== ':memory:') {
      this.database.exec('PRAGMA journal_mode = WAL')
      this.database.exec('PRAGMA synchronous = FULL')
      // Reuse Orca's existing cross-platform profile-path hardening instead of inventing a second
      // ACL/permission implementation for Code Fusion.
      hardenExistingSecureFile(path)
    }
  }

  private migrate(): void {
    const version = this.getSchemaVersion()
    if (version > ORCHESTRATION_LEDGER_SCHEMA_VERSION) {
      throw new Error(
        `Code Fusion ledger schema ${version} is newer than supported schema ${ORCHESTRATION_LEDGER_SCHEMA_VERSION}`
      )
    }
    if (version === ORCHESTRATION_LEDGER_SCHEMA_VERSION) {
      return
    }
    if (version !== 0) {
      throw new Error(`No Code Fusion ledger migration path from schema ${version}`)
    }

    this.database.exec('BEGIN IMMEDIATE')
    try {
      this.database.exec(`
        CREATE TABLE code_fusion_ledger_events (
          sequence INTEGER PRIMARY KEY AUTOINCREMENT,
          event_id TEXT NOT NULL UNIQUE,
          occurred_at TEXT NOT NULL,
          project_id TEXT,
          aggregate_type TEXT NOT NULL,
          aggregate_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
          actor_kind TEXT,
          actor_id TEXT,
          source TEXT,
          correlation_id TEXT,
          causation_id TEXT
        ) STRICT;
        CREATE INDEX code_fusion_ledger_aggregate_idx
          ON code_fusion_ledger_events(aggregate_type, aggregate_id, sequence);
        CREATE INDEX code_fusion_ledger_project_idx
          ON code_fusion_ledger_events(project_id, sequence);
        CREATE INDEX code_fusion_ledger_correlation_idx
          ON code_fusion_ledger_events(correlation_id, sequence);
        PRAGMA user_version = ${ORCHESTRATION_LEDGER_SCHEMA_VERSION};
      `)
      this.database.exec('COMMIT')
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new Error('Code Fusion orchestration ledger is closed')
    }
  }
}

function serializeEvent(event: OrchestrationLedgerEventInput): SerializedEvent {
  const projectId = optionalText('projectId', event.projectId, MAX_ID_LENGTH)
  const source = optionalText('source', event.source, MAX_SOURCE_LENGTH)
  const correlationId = optionalText('correlationId', event.correlationId, MAX_ID_LENGTH)
  const causationId = optionalText('causationId', event.causationId, MAX_ID_LENGTH)
  const actorId = optionalText('actor.id', event.actor?.id, MAX_ID_LENGTH)
  assertJsonValue(event.payload)

  const normalized: OrchestrationLedgerEventInput = {
    eventId: requireText('eventId', event.eventId, MAX_ID_LENGTH),
    occurredAt: requireIsoDate(event.occurredAt),
    aggregateType: requireAggregateType(event.aggregateType),
    aggregateId: requireText('aggregateId', event.aggregateId, MAX_ID_LENGTH),
    eventType: requireText('eventType', event.eventType, MAX_EVENT_TYPE_LENGTH),
    payload: event.payload,
    ...(projectId ? { projectId } : {}),
    ...(event.actor
      ? {
          actor: {
            kind: requireActorKind(event.actor.kind),
            ...(actorId ? { id: actorId } : {})
          }
        }
      : {}),
    ...(source ? { source } : {}),
    ...(correlationId ? { correlationId } : {}),
    ...(causationId ? { causationId } : {})
  }

  const payloadJson = JSON.stringify(normalized.payload)
  if (payloadJson === undefined) {
    throw new Error('Code Fusion ledger payload must be JSON serializable')
  }
  if (byteLength(payloadJson, 'utf8') > MAX_PAYLOAD_BYTES) {
    throw new Error(`Code Fusion ledger payload must not exceed ${MAX_PAYLOAD_BYTES} bytes`)
  }
  return { event: normalized, payloadJson }
}

function rowToRecord(row: LedgerRow): OrchestrationLedgerRecord {
  return {
    sequence: row.sequence,
    eventId: row.event_id,
    occurredAt: row.occurred_at,
    ...(row.project_id ? { projectId: row.project_id } : {}),
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    eventType: row.event_type,
    payload: JSON.parse(row.payload_json) as OrchestrationLedgerRecord['payload'],
    ...(row.actor_kind
      ? { actor: { kind: row.actor_kind, ...(row.actor_id ? { id: row.actor_id } : {}) } }
      : {}),
    ...(row.source ? { source: row.source } : {}),
    ...(row.correlation_id ? { correlationId: row.correlation_id } : {}),
    ...(row.causation_id ? { causationId: row.causation_id } : {})
  }
}

function normalizeReadOptions(options: OrchestrationLedgerReadOptions): {
  afterSequence: number
  limit: number
} {
  const afterSequence = options.afterSequence ?? 0
  const limit = options.limit ?? DEFAULT_READ_LIMIT
  if (!Number.isSafeInteger(afterSequence) || afterSequence < 0) {
    throw new Error('Code Fusion ledger afterSequence must be a non-negative safe integer')
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_READ_LIMIT) {
    throw new Error(`Code Fusion ledger limit must be between 1 and ${MAX_READ_LIMIT}`)
  }
  return { afterSequence, limit }
}

function requireIsoDate(value: string): string {
  const normalized = requireText('occurredAt', value, 64)
  const parsed = Date.parse(normalized)
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== normalized) {
    throw new Error('Code Fusion ledger occurredAt must be a canonical ISO timestamp')
  }
  return normalized
}

function requireAggregateType(value: OrchestrationLedgerAggregateType): OrchestrationLedgerAggregateType {
  if (!AGGREGATE_TYPES.has(value)) {
    throw new Error(`Unsupported Code Fusion ledger aggregate type: ${String(value)}`)
  }
  return value
}

function requireActorKind(value: OrchestrationLedgerActorKind): OrchestrationLedgerActorKind {
  if (!ACTOR_KINDS.has(value)) {
    throw new Error(`Unsupported Code Fusion ledger actor kind: ${String(value)}`)
  }
  return value
}

function requireText(name: string, value: string, maxLength: number): string {
  if (typeof value !== 'string') {
    throw new Error(`Code Fusion ledger ${name} must be text`)
  }
  const normalized = value.trim()
  if (!normalized || normalized.length > maxLength) {
    throw new Error(`Code Fusion ledger ${name} must be 1-${maxLength} characters`)
  }
  return normalized
}

function optionalText(
  name: string,
  value: string | undefined,
  maxLength: number
): string | undefined {
  if (value === undefined) {
    return undefined
  }
  return requireText(name, value, maxLength)
}

function assertJsonValue(
  value: unknown,
  depth = 0,
  ancestors: Set<object> = new Set()
): asserts value is JsonValue {
  if (depth > MAX_PAYLOAD_DEPTH) {
    throw new Error(`Code Fusion ledger payload exceeds maximum depth ${MAX_PAYLOAD_DEPTH}`)
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('Code Fusion ledger payload numbers must be finite')
    }
    return
  }
  if (typeof value !== 'object') {
    throw new Error('Code Fusion ledger payload must contain JSON values only')
  }
  if (ancestors.has(value)) {
    throw new Error('Code Fusion ledger payload must not contain cycles')
  }
  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      for (const item of value) {
        assertJsonValue(item, depth + 1, ancestors)
      }
      return
    }
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error('Code Fusion ledger payload objects must be plain JSON records')
    }
    for (const item of Object.values(value as Record<string, unknown>)) {
      assertJsonValue(item, depth + 1, ancestors)
    }
  } finally {
    ancestors.delete(value)
  }
}
