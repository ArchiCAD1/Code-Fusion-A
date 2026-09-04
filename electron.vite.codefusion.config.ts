import { resolve } from 'node:path'
import { defineConfig, type UserConfig } from 'electron-vite'
import { electronViteConfig } from './electron.vite.config'

/**
 * Code Fusion integration-build config.
 *
 * This wrapper preserves the inherited Orca build configuration and adds the separately emitted
 * orchestration-ledger worker entry without rewriting the large upstream config during the worker
 * proof. After development and packaged smoke tests pass, this entry can be promoted into the
 * canonical config in a small reviewed change.
 */
function createCodeFusionElectronViteConfig(): UserConfig {
  const baseMain = electronViteConfig.main
  const baseInput = baseMain?.build?.rollupOptions?.input
  if (!baseMain || !baseInput || typeof baseInput !== 'object' || Array.isArray(baseInput)) {
    throw new Error('Code Fusion requires the inherited named main-build input map')
  }

  return {
    ...electronViteConfig,
    main: {
      ...baseMain,
      build: {
        ...baseMain.build,
        rollupOptions: {
          ...baseMain.build?.rollupOptions,
          input: {
            ...(baseInput as Record<string, string>),
            'orchestration-ledger-worker-entry': resolve(
              'src/main/code-fusion/orchestration-ledger/orchestration-ledger-worker-entry.ts'
            )
          }
        }
      }
    }
  }
}

export const codeFusionElectronViteConfig = createCodeFusionElectronViteConfig()

export default defineConfig(codeFusionElectronViteConfig)
