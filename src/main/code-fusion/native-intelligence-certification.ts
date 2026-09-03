import type { NativeIntelligenceProvider } from '../../shared/code-fusion/native-intelligence-contract'
import type {
  NativeIntelligenceCertificationCheck,
  NativeIntelligenceCertificationReport
} from '../../shared/code-fusion/native-intelligence-certification'

export type NativeIntelligenceCertificationClock = () => Date

const defaultClock: NativeIntelligenceCertificationClock = () => new Date()

/**
 * Runs the first read-only native-runtime certification scenario.
 *
 * This produces evidence only. A passing report must still be classified according to the
 * environment that executed it; source/unit execution is not equivalent to macOS runtime proof.
 */
export async function runNativeIntelligenceReadCertification(
  provider: NativeIntelligenceProvider,
  clock: NativeIntelligenceCertificationClock = defaultClock
): Promise<NativeIntelligenceCertificationReport> {
  const startedAt = clock().toISOString()
  let runtimeName: string | null = null
  let protocolVersion: NativeIntelligenceCertificationReport['protocolVersion'] = null
  const checks: NativeIntelligenceCertificationCheck[] = []

  try {
    const health = await provider.getHealth()
    runtimeName = health.runtimeName
    protocolVersion = health.protocolVersion
    if (health.state !== 'ready') {
      checks.push({
        id: 'runtime-ready',
        status: 'fail',
        detail: health.message?.trim() || `Runtime state is ${health.state}`
      })
      checks.push({
        id: 'model-inventory',
        status: 'fail',
        detail: 'Model inventory was not requested because the runtime is not ready.'
      })
      return finish('fail', null)
    }
    checks.push({
      id: 'runtime-ready',
      status: 'pass',
      detail: 'Runtime reported ready.'
    })
  } catch (error) {
    checks.push({
      id: 'runtime-ready',
      status: 'fail',
      detail: safeCertificationError(error)
    })
    checks.push({
      id: 'model-inventory',
      status: 'fail',
      detail: 'Model inventory was not requested because runtime health could not be read.'
    })
    return finish('fail', null)
  }

  try {
    const models = await provider.listModels()
    checks.push({
      id: 'model-inventory',
      status: 'pass',
      detail: models.length === 1 ? '1 model returned.' : `${models.length} models returned.`
    })
    return finish('pass', models.length)
  } catch (error) {
    checks.push({
      id: 'model-inventory',
      status: 'fail',
      detail: safeCertificationError(error)
    })
    return finish('fail', null)
  }

  function finish(
    result: NativeIntelligenceCertificationReport['result'],
    modelCount: number | null
  ): NativeIntelligenceCertificationReport {
    return {
      result,
      startedAt,
      completedAt: clock().toISOString(),
      runtimeName,
      protocolVersion,
      modelCount,
      checks
    }
  }
}

function safeCertificationError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  const normalized = raw.trim() || 'Native intelligence certification request failed'
  return normalized
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/((?:api[_-]?key|token|authorization)=)[^&\s]+/gi, '$1[redacted]')
}
