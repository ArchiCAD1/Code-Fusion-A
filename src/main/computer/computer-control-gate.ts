import {
  acquireComputerControl,
  createComputerControlState,
  evaluateComputerActionControl,
  releaseComputerControl,
  takeComputerControlAsHuman,
  type ComputerControlState,
  type ComputerControlTransitionDecision
} from '../../shared/code-fusion/computer-control-ownership'
import { RuntimeClientError } from './runtime-client-error'

const AUTOMATION_ACTOR = { kind: 'agent' as const, id: 'code-fusion-computer-automation' }
let state = createComputerControlState()

export function getComputerControlState(): ComputerControlState {
  return cloneState(state)
}

export function authorizeAutomatedComputerAction(): void {
  if (state.owner === null) {
    const acquired = acquireComputerControl(state, AUTOMATION_ACTOR)
    if (!acquired.allowed) {
      throw new RuntimeClientError('computer_control_unavailable', 'Computer control is unavailable')
    }
    state = acquired.nextState
  }

  const decision = evaluateComputerActionControl(state, AUTOMATION_ACTOR)
  if (decision.allowed) return

  if (state.owner?.kind === 'human') {
    throw new RuntimeClientError(
      'computer_control_owned_by_human',
      'Computer control is currently owned by a human. Release control before automation resumes.'
    )
  }

  throw new RuntimeClientError(
    'computer_control_owned_by_other',
    'Computer control is currently owned by another actor'
  )
}

export function takeHumanComputerControl(humanId: string): ComputerControlTransitionDecision {
  const transition = takeComputerControlAsHuman(state, { kind: 'human', id: humanId })
  if (transition.allowed) state = transition.nextState
  return cloneTransition(transition)
}

export function releaseHumanComputerControl(
  humanId: string,
  expectedEpoch: number
): ComputerControlTransitionDecision {
  const transition = releaseComputerControl(
    state,
    { kind: 'human', id: humanId },
    expectedEpoch
  )
  if (transition.allowed) state = transition.nextState
  return cloneTransition(transition)
}

export function resetComputerControlGateForTest(): void {
  state = createComputerControlState()
}

function cloneTransition(
  transition: ComputerControlTransitionDecision
): ComputerControlTransitionDecision {
  return { ...transition, nextState: cloneState(transition.nextState) }
}

function cloneState(value: ComputerControlState): ComputerControlState {
  return {
    version: value.version,
    epoch: value.epoch,
    owner: value.owner ? { ...value.owner } : null
  }
}
