import { join } from 'node:path'

export const CODE_FUSION_LEDGER_FILENAME = 'code-fusion-ledger.sqlite3'

/** Resolves the ledger beside the profile's existing Orca persistence files. */
export function resolveCodeFusionLedgerPath(profileStorageDirectory: string): string {
  const normalized = profileStorageDirectory.trim()
  if (!normalized) {
    throw new Error('Code Fusion ledger profile storage directory must not be empty')
  }
  return join(normalized, CODE_FUSION_LEDGER_FILENAME)
}
