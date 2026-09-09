import { ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron'
import {
  toComputerControlPublicState,
  toComputerControlPublicTransition,
  type ComputerControlPublicState,
  type ComputerControlPublicTransitionDecision
} from '../../shared/code-fusion/computer-control-ownership'
import {
  getComputerControlState,
  releaseHumanComputerControl,
  takeHumanComputerControl
} from './computer-control-gate'
import { RuntimeClientError } from './runtime-client-error'
import { stopComputerSidecarForHumanControl } from './sidecar-client'

const COMPUTER_CONTROL_GET_STATE = 'computerControl:getState'
const COMPUTER_CONTROL_TAKE = 'computerControl:take'
const COMPUTER_CONTROL_RELEASE = 'computerControl:release'
const destroyCleanupInstalled = new WeakSet<WebContents>()

export function registerComputerControlIpcHandlers(): void {
  ipcMain.handle(COMPUTER_CONTROL_GET_STATE, () => publicState())
  ipcMain.handle(COMPUTER_CONTROL_TAKE, (event) => takeForRenderer(event))
  ipcMain.handle(COMPUTER_CONTROL_RELEASE, (event, expectedEpoch: unknown) =>
    releaseForRenderer(event, expectedEpoch)
  )
}

function takeForRenderer(event: IpcMainInvokeEvent): ComputerControlPublicTransitionDecision {
  const humanId = rendererHumanId(event.sender.id)
  const transition = takeHumanComputerControl(humanId)
  if (transition.allowed) {
    if (transition.changed && transition.nextState.owner?.kind === 'human') {
      stopComputerSidecarForHumanControl()
    }
    installDestroyedCleanup(event.sender, humanId)
  }
  return toComputerControlPublicTransition(transition)
}

function releaseForRenderer(
  event: IpcMainInvokeEvent,
  expectedEpoch: unknown
): ComputerControlPublicTransitionDecision {
  if (!Number.isSafeInteger(expectedEpoch) || (expectedEpoch as number) < 0) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Computer control release requires a non-negative safe integer epoch'
    )
  }
  return toComputerControlPublicTransition(
    releaseHumanComputerControl(rendererHumanId(event.sender.id), expectedEpoch as number)
  )
}

function installDestroyedCleanup(sender: WebContents, humanId: string): void {
  if (destroyCleanupInstalled.has(sender)) return
  destroyCleanupInstalled.add(sender)
  sender.once('destroyed', () => {
    destroyCleanupInstalled.delete(sender)
    const current = getComputerControlState()
    if (current.owner?.kind === 'human' && current.owner.id === humanId) {
      releaseHumanComputerControl(humanId, current.epoch)
    }
  })
}

function publicState(): ComputerControlPublicState {
  return toComputerControlPublicState(getComputerControlState())
}

function rendererHumanId(senderId: number): string {
  return `renderer:${senderId}`
}