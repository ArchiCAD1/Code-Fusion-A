import { describe, expect, it } from 'vitest'
import { codeFusionElectronViteConfig } from './electron.vite.codefusion.config'

describe('Code Fusion Electron build entries', () => {
  it('preserves inherited entries and emits the ledger worker as a stable named main entry', () => {
    const input = codeFusionElectronViteConfig.main?.build?.rollupOptions?.input
    expect(input).toBeTypeOf('object')
    expect(input).not.toBeNull()
    expect(Array.isArray(input)).toBe(false)

    const entries = input as Record<string, string>
    expect(entries.index).toContain('src/main/index.ts')
    expect(entries['port-scan-command-worker-entry']).toContain(
      'src/main/ports/port-scan-command-worker-entry.ts'
    )
    expect(entries['orchestration-ledger-worker-entry']).toContain(
      'src/main/code-fusion/orchestration-ledger/orchestration-ledger-worker-entry.ts'
    )
  })
})
