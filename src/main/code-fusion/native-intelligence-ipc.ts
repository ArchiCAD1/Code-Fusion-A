import { ipcMain } from 'electron'

import type { NativeIntelligenceProvider } from '../../shared/code-fusion/native-intelligence-contract'
import { NATIVE_INTELLIGENCE_IPC_CHANNELS } from '../../shared/code-fusion/native-intelligence-ipc'
import { NativNativeIntelligenceProvider } from './nativ-native-intelligence-provider'
import { runNativeIntelligenceReadCertification } from './native-intelligence-certification'
import { readNativeIntelligenceSnapshot } from './native-intelligence-read-model'

export type NativeIntelligenceProviderFactory = () => NativeIntelligenceProvider

export type NativeIntelligenceIpcDependencies = {
  createProvider?: NativeIntelligenceProviderFactory
}

/**
 * Registers the renderer-visible Code Fusion native-intelligence boundary.
 *
 * The boundary is intentionally read-only. Provider creation is lazy so the first request occurs
 * after the ready-phase Electron network configuration is available.
 */
export function registerNativeIntelligenceIpcHandlers(
  dependencies: NativeIntelligenceIpcDependencies = {}
): void {
  const createProvider =
    dependencies.createProvider ?? (() => new NativNativeIntelligenceProvider())
  let provider: NativeIntelligenceProvider | undefined

  const getProvider = (): NativeIntelligenceProvider => {
    provider ??= createProvider()
    return provider
  }

  ipcMain.handle(NATIVE_INTELLIGENCE_IPC_CHANNELS.getSnapshot, () =>
    readNativeIntelligenceSnapshot(getProvider())
  )
  ipcMain.handle(NATIVE_INTELLIGENCE_IPC_CHANNELS.runReadCertification, () =>
    runNativeIntelligenceReadCertification(getProvider())
  )
}
