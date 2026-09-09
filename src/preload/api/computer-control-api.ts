import type {
  ComputerControlPublicState,
  ComputerControlPublicTransitionDecision
} from '../../shared/code-fusion/computer-control-ownership'

export type ComputerControlApi = {
  getState: () => Promise<ComputerControlPublicState>
  take: () => Promise<ComputerControlPublicTransitionDecision>
  release: (args: { expectedEpoch: number }) => Promise<ComputerControlPublicTransitionDecision>
}
