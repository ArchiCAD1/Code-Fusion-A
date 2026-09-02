import { ipcRenderer } from 'electron'

import { NATIVE_INTELLIGENCE_IPC_CHANNELS } from '../../shared/code-fusion/native-intelligence-ipc'
import type { PreloadApi } from '../api-types'

export const nativeIntelligenceApi = {
  getSnapshot: () => ipcRenderer.invoke(NATIVE_INTELLIGENCE_IPC_CHANNELS.getSnapshot)
} satisfies PreloadApi['nativeIntelligence']
