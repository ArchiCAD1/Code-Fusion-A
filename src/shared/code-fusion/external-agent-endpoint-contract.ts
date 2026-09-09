export const EXTERNAL_AGENT_ENDPOINT_CONTRACT_VERSION = 1 as const

export const EXTERNAL_AGENT_PROTOCOLS = ['ag-ui'] as const
export const EXTERNAL_AGENT_LOCATIONS = ['local', 'remote'] as const
export const EXTERNAL_AGENT_AUTH_MODES = ['none', 'host-managed'] as const
export const EXTERNAL_AGENT_STATES = [
  'unknown',
  'available',
  'degraded',
  'unavailable',
  'blocked'
] as const
export const EXTERNAL_AGENT_CAPABILITIES = [
  'streaming',
  'tool-calls',
  'shared-state',
  'human-in-loop',
  'generative-ui',
  'computer-use',
  'background-runs',
  'subagents',
  'multimodal'
] as const

export type ExternalAgentEndpointContractVersion =
  typeof EXTERNAL_AGENT_ENDPOINT_CONTRACT_VERSION
export type ExternalAgentProtocol = (typeof EXTERNAL_AGENT_PROTOCOLS)[number]
export type ExternalAgentLocation = (typeof EXTERNAL_AGENT_LOCATIONS)[number]
export type ExternalAgentAuthMode = (typeof EXTERNAL_AGENT_AUTH_MODES)[number]
export type ExternalAgentState = (typeof EXTERNAL_AGENT_STATES)[number]
export type ExternalAgentCapability = (typeof EXTERNAL_AGENT_CAPABILITIES)[number]

/** Renderer-safe metadata only. Endpoint URLs and authorization material stay host-owned. */
export interface ExternalAgentEndpointSummary {
  contractVersion: ExternalAgentEndpointContractVersion
  id: string
  displayName: string
  protocol: ExternalAgentProtocol
  location: ExternalAgentLocation
  authMode: ExternalAgentAuthMode
  state: ExternalAgentState
  capabilities: readonly ExternalAgentCapability[]
}

export interface ExternalAgentEndpointSummaryInput {
  id: unknown
  displayName: unknown
  protocol: unknown
  location: unknown
  authMode: unknown
  state: unknown
  capabilities: unknown
}

const ENDPOINT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const MAX_DISPLAY_NAME_LENGTH = 160

export function createExternalAgentEndpointSummary(
  input: ExternalAgentEndpointSummaryInput
): ExternalAgentEndpointSummary {
  const id = normalizeEndpointId(input.id)
  const displayName = normalizeDisplayName(input.displayName)
  const protocol = requireEnumValue(input.protocol, EXTERNAL_AGENT_PROTOCOLS, 'protocol')
  const location = requireEnumValue(input.location, EXTERNAL_AGENT_LOCATIONS, 'location')
  const authMode = requireEnumValue(input.authMode, EXTERNAL_AGENT_AUTH_MODES, 'authMode')
  const state = requireEnumValue(input.state, EXTERNAL_AGENT_STATES, 'state')
  const capabilities = normalizeCapabilities(input.capabilities)

  return {
    contractVersion: EXTERNAL_AGENT_ENDPOINT_CONTRACT_VERSION,
    id,
    displayName,
    protocol,
    location,
    authMode,
    state,
    capabilities
  }
}

export function supportsExternalAgentCapability(
  endpoint: Pick<ExternalAgentEndpointSummary, 'capabilities'>,
  capability: ExternalAgentCapability
): boolean {
  return endpoint.capabilities.includes(capability)
}

export function isExternalAgentProtocol(value: unknown): value is ExternalAgentProtocol {
  return typeof value === 'string' && EXTERNAL_AGENT_PROTOCOLS.includes(value as ExternalAgentProtocol)
}

function normalizeEndpointId(value: unknown): string {
  if (typeof value !== 'string') {
    throw new TypeError('External agent endpoint id must be a string')
  }
  const id = value.trim()
  if (!ENDPOINT_ID_PATTERN.test(id)) {
    throw new TypeError('External agent endpoint id is invalid')
  }
  return id
}

function normalizeDisplayName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new TypeError('External agent endpoint displayName must be a string')
  }
  const displayName = value.trim()
  if (displayName.length === 0 || displayName.length > MAX_DISPLAY_NAME_LENGTH) {
    throw new TypeError('External agent endpoint displayName is invalid')
  }
  return displayName
}

function normalizeCapabilities(value: unknown): readonly ExternalAgentCapability[] {
  if (!Array.isArray(value)) {
    throw new TypeError('External agent endpoint capabilities must be an array')
  }

  const capabilities: ExternalAgentCapability[] = []
  for (const candidate of value) {
    const capability = requireEnumValue(candidate, EXTERNAL_AGENT_CAPABILITIES, 'capability')
    if (!capabilities.includes(capability)) {
      capabilities.push(capability)
    }
  }
  return capabilities
}

function requireEnumValue<const T extends readonly string[]>(
  value: unknown,
  values: T,
  field: string
): T[number] {
  if (typeof value !== 'string' || !values.includes(value as T[number])) {
    throw new TypeError(`External agent endpoint ${field} is invalid`)
  }
  return value as T[number]
}
