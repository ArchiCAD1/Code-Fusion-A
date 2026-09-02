import type { NativeIntelligenceProvider } from '../../shared/code-fusion/native-intelligence-contract'
import type { NativeIntelligenceSnapshot } from '../../shared/code-fusion/native-intelligence-ipc'

export type NativeIntelligenceClock = () => Date

const defaultClock: NativeIntelligenceClock = () => new Date()

/**
 * Builds the renderer-safe snapshot without leaking provider configuration or credentials.
 * Inventory is only read after the runtime proves ready; an inventory failure degrades the
 * snapshot instead of rejecting the whole renderer request.
 */
export async function readNativeIntelligenceSnapshot(
  provider: NativeIntelligenceProvider,
  clock: NativeIntelligenceClock = defaultClock
): Promise<NativeIntelligenceSnapshot> {
  const health = await provider.getHealth()
  if (health.state !== 'ready') {
    return {
      health,
      models: [],
      refreshedAt: clock().toISOString()
    }
  }

  try {
    const models = await provider.listModels()
    return {
      health,
      models,
      refreshedAt: clock().toISOString()
    }
  } catch (error) {
    const modelInventoryError = safeRendererErrorMessage(error)
    return {
      health: {
        ...health,
        state: 'degraded',
        message: 'Native runtime is reachable, but model inventory is unavailable.'
      },
      models: [],
      refreshedAt: clock().toISOString(),
      modelInventoryError
    }
  }
}

function safeRendererErrorMessage(error: unknown): string {
  if (!(error instanceof Error) || !error.message.trim()) {
    return 'Model inventory request failed'
  }
  return error.message.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
}
