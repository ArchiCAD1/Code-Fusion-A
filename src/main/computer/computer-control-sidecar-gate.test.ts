import { beforeEach, describe, expect, it, vi } from 'vitest'

const { forkMock } = vi.hoisted(() => ({ forkMock: vi.fn() }))

vi.mock('node:child_process', () => ({
  fork: forkMock
}))

import { takeHumanComputerControl } from './computer-control-gate'
import { callComputerSidecarAction, resetComputerSidecarForTest } from './sidecar-client'

describe('computer control sidecar gate', () => {
  beforeEach(() => {
    resetComputerSidecarForTest()
    forkMock.mockReset()
  })

  it('refuses an automated mutation before the sidecar process can start', async () => {
    const takeover = takeHumanComputerControl('local-human')
    expect(takeover.allowed).toBe(true)

    await expect(
      callComputerSidecarAction('click', {
        app: 'Finder',
        elementIndex: 0
      })
    ).rejects.toMatchObject({
      code: 'computer_control_owned_by_human'
    })

    expect(forkMock).not.toHaveBeenCalled()
  })
})
