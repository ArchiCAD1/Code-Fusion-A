export const COMPUTER_CONTROL_OWNERSHIP_VERSION = 1 as const

export const MAX_COMPUTER_CONTROL_ACTOR_ID_LENGTH = 256

export type ComputerControlActorKind = 'agent' | 'human'

export interface ComputerControlActor {
  kind: ComputerControlActorKind
  id: string
}

export interface ComputerControlState {
  version: typeof COMPUTER_CONTROL_OWNERSHIP_VERSION
  epoch: number
  owner: ComputerControlActor | null
}

export type ComputerControlTransitionReason =
  | 'acquired'
  | 'already-owner'
  | 'owned-by-other'
  | 'human-takeover'
  | 'human-owner-protected'
  | 'handoff'
  | 'released'
  | 'not-owner'
  | 'stale-epoch'
  | 'invalid-actor'
  | 'invalid-human'

export interface ComputerControlTransitionDecision {
  allowed: boolean
  changed: boolean
  reason: ComputerControlTransitionReason
  nextState: ComputerControlState
}

export type ComputerActionControlReason = 'owner' | 'unowned' | 'owned-by-other' | 'invalid-actor'

export interface ComputerActionControlDecision {
  allowed: boolean
  reason: ComputerActionControlReason
}

export function createComputerControlState(): ComputerControlState {
  return {
    version: COMPUTER_CONTROL_OWNERSHIP_VERSION,
    epoch: 0,
    owner: null
  }
}

export function normalizeComputerControlActor(actor: ComputerControlActor): ComputerControlActor | null {
  if (actor.kind !== 'agent' && actor.kind !== 'human') return null

  const id = actor.id.trim()
  if (id.length === 0 || id.length > MAX_COMPUTER_CONTROL_ACTOR_ID_LENGTH) return null
  if (/\p{Cc}/u.test(id)) return null

  return { kind: actor.kind, id }
}

export function isComputerControlOwner(
  state: ComputerControlState,
  actor: ComputerControlActor
): boolean {
  const normalized = normalizeComputerControlActor(actor)
  return normalized !== null && state.owner !== null && sameActor(state.owner, normalized)
}

export function evaluateComputerActionControl(
  state: ComputerControlState,
  actor: ComputerControlActor
): ComputerActionControlDecision {
  const normalized = normalizeComputerControlActor(actor)
  if (!normalized) return { allowed: false, reason: 'invalid-actor' }
  if (!state.owner) return { allowed: false, reason: 'unowned' }
  if (!sameActor(state.owner, normalized)) return { allowed: false, reason: 'owned-by-other' }
  return { allowed: true, reason: 'owner' }
}

export function acquireComputerControl(
  state: ComputerControlState,
  actor: ComputerControlActor
): ComputerControlTransitionDecision {
  const normalized = normalizeComputerControlActor(actor)
  if (!normalized) return unchanged(state, false, 'invalid-actor')

  if (!state.owner) {
    return changed(state, normalized, 'acquired')
  }

  if (sameActor(state.owner, normalized)) {
    return unchanged(state, true, 'already-owner')
  }

  return unchanged(state, false, 'owned-by-other')
}

export function takeComputerControlAsHuman(
  state: ComputerControlState,
  actor: ComputerControlActor
): ComputerControlTransitionDecision {
  const normalized = normalizeComputerControlActor(actor)
  if (!normalized || normalized.kind !== 'human') {
    return unchanged(state, false, 'invalid-human')
  }

  if (state.owner && sameActor(state.owner, normalized)) {
    return unchanged(state, true, 'already-owner')
  }

  if (state.owner?.kind === 'human') {
    return unchanged(state, false, 'human-owner-protected')
  }

  return changed(state, normalized, 'human-takeover')
}

export function handoffComputerControl(
  state: ComputerControlState,
  from: ComputerControlActor,
  to: ComputerControlActor,
  expectedEpoch: number
): ComputerControlTransitionDecision {
  const normalizedFrom = normalizeComputerControlActor(from)
  const normalizedTo = normalizeComputerControlActor(to)
  if (!normalizedFrom || !normalizedTo) return unchanged(state, false, 'invalid-actor')
  if (expectedEpoch !== state.epoch) return unchanged(state, false, 'stale-epoch')
  if (!state.owner || !sameActor(state.owner, normalizedFrom)) {
    return unchanged(state, false, 'not-owner')
  }
  if (sameActor(normalizedFrom, normalizedTo)) {
    return unchanged(state, true, 'already-owner')
  }

  return changed(state, normalizedTo, 'handoff')
}

export function releaseComputerControl(
  state: ComputerControlState,
  actor: ComputerControlActor,
  expectedEpoch: number
): ComputerControlTransitionDecision {
  const normalized = normalizeComputerControlActor(actor)
  if (!normalized) return unchanged(state, false, 'invalid-actor')
  if (expectedEpoch !== state.epoch) return unchanged(state, false, 'stale-epoch')
  if (!state.owner || !sameActor(state.owner, normalized)) {
    return unchanged(state, false, 'not-owner')
  }

  return {
    allowed: true,
    changed: true,
    reason: 'released',
    nextState: {
      version: COMPUTER_CONTROL_OWNERSHIP_VERSION,
      epoch: nextEpoch(state.epoch),
      owner: null
    }
  }
}

function changed(
  state: ComputerControlState,
  owner: ComputerControlActor,
  reason: Extract<ComputerControlTransitionReason, 'acquired' | 'human-takeover' | 'handoff'>
): ComputerControlTransitionDecision {
  return {
    allowed: true,
    changed: true,
    reason,
    nextState: {
      version: COMPUTER_CONTROL_OWNERSHIP_VERSION,
      epoch: nextEpoch(state.epoch),
      owner
    }
  }
}

function unchanged(
  state: ComputerControlState,
  allowed: boolean,
  reason: Exclude<
    ComputerControlTransitionReason,
    'acquired' | 'human-takeover' | 'handoff' | 'released'
  >
): ComputerControlTransitionDecision {
  return { allowed, changed: false, reason, nextState: state }
}

function nextEpoch(epoch: number): number {
  if (!Number.isSafeInteger(epoch) || epoch < 0 || epoch === Number.MAX_SAFE_INTEGER) {
    throw new Error('Computer control epoch is invalid or exhausted')
  }
  return epoch + 1
}

function sameActor(left: ComputerControlActor, right: ComputerControlActor): boolean {
  return left.kind === right.kind && left.id === right.id
}
