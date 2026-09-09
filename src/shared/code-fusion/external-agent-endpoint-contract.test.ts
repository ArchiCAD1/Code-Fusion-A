import { describe, expect, it } from 'vitest'

import {
  createExternalAgentEndpointSummary,
  EXTERNAL_AGENT_ENDPOINT_CONTRACT_VERSION,
  isExternalAgentProtocol,
  supportsExternalAgentCapability
} from './external-agent-endpoint-contract'

describe('external agent endpoint contract', () => {
  it('creates bounded renderer-safe AG-UI metadata', () => {
    const endpoint = createExternalAgentEndpointSummary({
      id: 'research-agent',
      displayName: '  Research Agent  ',
      protocol: 'ag-ui',
      location: 'remote',
      authMode: 'host-managed',
      state: 'available',
      capabilities: ['streaming', 'tool-calls', 'streaming', 'human-in-loop']
    })

    expect(endpoint).toEqual({
      contractVersion: EXTERNAL_AGENT_ENDPOINT_CONTRACT_VERSION,
      id: 'research-agent',
      displayName: 'Research Agent',
      protocol: 'ag-ui',
      location: 'remote',
      authMode: 'host-managed',
      state: 'available',
      capabilities: ['streaming', 'tool-calls', 'human-in-loop']
    })
    expect(endpoint).not.toHaveProperty('endpointUrl')
    expect(endpoint).not.toHaveProperty('authorizationHeader')
    expect(endpoint).not.toHaveProperty('token')
    expect(endpoint).not.toHaveProperty('secret')
  })

  it('rejects unsupported protocols rather than silently treating them as AG-UI', () => {
    expect(() =>
      createExternalAgentEndpointSummary({
        id: 'agent',
        displayName: 'Agent',
        protocol: 'custom-http',
        location: 'local',
        authMode: 'none',
        state: 'unknown',
        capabilities: []
      })
    ).toThrow('protocol is invalid')
  })

  it('rejects malformed endpoint identifiers', () => {
    for (const id of ['', '../escape', 'space separated', 'x'.repeat(129)]) {
      expect(() =>
        createExternalAgentEndpointSummary({
          id,
          displayName: 'Agent',
          protocol: 'ag-ui',
          location: 'local',
          authMode: 'none',
          state: 'unknown',
          capabilities: []
        })
      ).toThrow('id is invalid')
    }
  })

  it('rejects unknown capabilities instead of widening permission vocabulary', () => {
    expect(() =>
      createExternalAgentEndpointSummary({
        id: 'agent',
        displayName: 'Agent',
        protocol: 'ag-ui',
        location: 'local',
        authMode: 'none',
        state: 'unknown',
        capabilities: ['shell-everything']
      })
    ).toThrow('capability is invalid')
  })

  it('reports capability support explicitly', () => {
    const endpoint = createExternalAgentEndpointSummary({
      id: 'agent',
      displayName: 'Agent',
      protocol: 'ag-ui',
      location: 'local',
      authMode: 'none',
      state: 'available',
      capabilities: ['streaming', 'shared-state']
    })

    expect(supportsExternalAgentCapability(endpoint, 'streaming')).toBe(true)
    expect(supportsExternalAgentCapability(endpoint, 'computer-use')).toBe(false)
  })

  it('recognizes only the adopted external interaction protocol', () => {
    expect(isExternalAgentProtocol('ag-ui')).toBe(true)
    expect(isExternalAgentProtocol('a2a')).toBe(false)
    expect(isExternalAgentProtocol(null)).toBe(false)
  })
})
