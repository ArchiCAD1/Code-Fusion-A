import { beforeEach, describe, expect, it, vi } from 'vitest'

const ipcMocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  stopComputerSidecarForHumanControl: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      ipcMocks.handlers.set(channel, handler)
    }
  }
}))

vi.mock('./sidecar-client', () => ({
  stopComputerSidecarForHumanControl: ipcMocks.stopComputerSidecarForHumanControl
}))

import { getComputerControlState, resetComputerControlGateForTest } from './computer-control-gate'
import { registerComputerControlIpcHandlers } from './computer-control-ipc'

describe('computer control IPC', () => {
  beforeEach(() => {
    ipcMocks.handlers.clear()
    ipcMocks.stopComputerSidecarForHumanControl.mockReset()
    resetComputerControlGateForTest()
    registerComputerControlIpcHandlers()
  })

  it('exposes only renderer-safe ownership state and interrupts active automation', async () => {
    const sender = fakeSender(41)
    const transition = await invoke('computerControl:take', sender.event)

    expect(transition).toEqual({
      allowed: true,
      changed: true,
      reason: 'human-takeover',
      state: { version: 1, epoch: 1, owner: 'human' }
    })
    expect(ipcMocks.stopComputerSidecarForHumanControl).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(transition)).not.toContain('renderer:41')
    expect(await invoke('computerControl:getState', sender.event)).toEqual({
      version: 1,
      epoch: 1,
      owner: 'human'
    })
  })

  it('does not interrupt the sidecar again for an idempotent takeover', async () => {
    const sender = fakeSender(42)
    await invoke('computerControl:take', sender.event)
    ipcMocks.stopComputerSidecarForHumanControl.mockClear()

    expect(await invoke('computerControl:take', sender.event)).toMatchObject({
      allowed: true,
      changed: false,
      reason: 'already-owner'
    })
    expect(ipcMocks.stopComputerSidecarForHumanControl).not.toHaveBeenCalled()
  })

  it('derives ownership from the trusted sender instead of renderer input', async () => {
    const first = fakeSender(7)
    const second = fakeSender(8)

    await invoke('computerControl:take', first.event)
    ipcMocks.stopComputerSidecarForHumanControl.mockClear()
    expect(await invoke('computerControl:take', second.event)).toMatchObject({
      allowed: false,
      reason: 'human-owner-protected'
    })
    expect(ipcMocks.stopComputerSidecarForHumanControl).not.toHaveBeenCalled()
    expect(getComputerControlState().owner).toEqual({ kind: 'human', id: 'renderer:7' })
  })

  it('requires the current epoch to release control', async () => {
    const sender = fakeSender(17)
    const takeover = (await invoke('computerControl:take', sender.event)) as {
      state: { epoch: number }
    }

    expect(await invoke('computerControl:release', sender.event, takeover.state.epoch - 1)).toMatchObject({
      allowed: false,
      reason: 'stale-epoch'
    })
    expect(await invoke('computerControl:release', sender.event, takeover.state.epoch)).toMatchObject({
      allowed: true,
      changed: true,
      reason: 'released',
      state: { owner: null }
    })
  })

  it('rejects malformed release epochs', async () => {
    const sender = fakeSender(18)
    await invoke('computerControl:take', sender.event)

    await expect(invoke('computerControl:release', sender.event, -1)).rejects.toMatchObject({
      code: 'invalid_argument'
    })
    await expect(invoke('computerControl:release', sender.event, 1.5)).rejects.toMatchObject({
      code: 'invalid_argument'
    })
  })

  it('automatically releases human control when its renderer is destroyed', async () => {
    const sender = fakeSender(99)
    await invoke('computerControl:take', sender.event)
    expect(getComputerControlState().owner?.kind).toBe('human')

    sender.destroy()

    expect(getComputerControlState().owner).toBeNull()
  })
})

function fakeSender(id: number) {
  let destroyed: (() => void) | undefined
  const sender = {
    id,
    once: vi.fn((event: string, callback: () => void) => {
      if (event === 'destroyed') destroyed = callback
      return sender
    })
  }
  return {
    event: { sender } as never,
    destroy: () => destroyed?.()
  }
}

async function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = ipcMocks.handlers.get(channel)
  if (!handler) throw new Error(`Missing IPC handler ${channel}`)
  return await handler(...args)
}