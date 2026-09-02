import { describe, expect, it } from 'vitest'

import {
  isNativeIntelligenceProtocolVersion,
  NATIVE_INTELLIGENCE_CAPABILITIES,
  NATIVE_INTELLIGENCE_PROTOCOL_VERSION,
  supportsNativeIntelligenceCapability,
  type NativeIntelligenceHealth
} from './native-intelligence-contract'

describe('native intelligence contract', () => {
  it('pins the initial protocol version', () => {
    expect(NATIVE_INTELLIGENCE_PROTOCOL_VERSION).toBe(1)
    expect(isNativeIntelligenceProtocolVersion(1)).toBe(true)
    expect(isNativeIntelligenceProtocolVersion(2)).toBe(false)
    expect(isNativeIntelligenceProtocolVersion('1')).toBe(false)
  })

  it('keeps capability identifiers unique', () => {
    expect(new Set(NATIVE_INTELLIGENCE_CAPABILITIES).size).toBe(
      NATIVE_INTELLIGENCE_CAPABILITIES.length
    )
  })

  it('checks capabilities without assuming every runtime supports every feature', () => {
    const health: NativeIntelligenceHealth = {
      protocolVersion: NATIVE_INTELLIGENCE_PROTOCOL_VERSION,
      state: 'ready',
      runtimeName: 'test-runtime',
      capabilities: ['chat', 'model-downloads']
    }

    expect(supportsNativeIntelligenceCapability(health, 'chat')).toBe(true)
    expect(supportsNativeIntelligenceCapability(health, 'images')).toBe(false)
  })
})
