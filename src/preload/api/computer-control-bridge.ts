import { ipcRenderer } from 'electron'
import type { ComputerControlApi } from './computer-control-api'

export const computerControlApi = {
  getState: () => ipcRenderer.invoke('computerControl:getState'),
  take: () => ipcRenderer.invoke('computerControl:take'),
  release: ({ expectedEpoch }) => ipcRenderer.invoke('computerControl:release', expectedEpoch)
} satisfies ComputerControlApi
