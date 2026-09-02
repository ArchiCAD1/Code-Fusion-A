# Code Fusion Source Baseline

Status: `VERIFIED-SOURCE`
Recorded: 2026-09-01
Architecture branch: `codefusion/architecture-foundation`

This document freezes the source-level starting point for Code Fusion before substantive fusion work. Build/runtime verification is intentionally tracked separately and must not be inferred from repository inspection.

## A — canonical application host

- Repository: `ArchiCAD1/Code-Fusion-A`
- Upstream/parent: `stablyai/orca`
- Baseline commit: `5aa02ead59a4f34a186c3e8814558b5795260ee9`
- Baseline tree: `6d2c42163ccbe421a6af7f3818d5c4a7eaaddf56`
- Upstream head observed at baseline: `5aa02ead59a4f34a186c3e8814558b5795260ee9`
- Upstream delta at freeze: exact head alignment
- Package name at freeze: `orca`
- Package version at freeze: `1.4.178-rc.2`
- License: MIT
- License blob: `fbf46fc17dacb1f65e03e2b6290eb53ba94b149d`
- License copyright: Copyright (c) 2026 Lovecast Inc.

### Verified source capabilities retained as host responsibilities

- Parallel agent/worktree orchestration
- Terminal and CLI runtime
- Editor / project workspace
- Source-control and review flows
- Browser/design-mode infrastructure
- Computer Use native helper infrastructure
- SSH/relay/remote execution architecture
- Mobile companion architecture
- Cross-platform macOS/Windows/Linux application shell

## B — native-intelligence donor/reference

- Repository: `ArchiCAD1/Code-Fusion-B`
- Upstream/parent: `Blaizzy/nativ`
- Donor baseline commit: `64dadb98ee61c3687044d3cc54eebe3f5b36fbea`
- Upstream head observed during freeze: `495e9119dae0cf2e4968380d03a73b15786ae506`
- Upstream delta observed during freeze: donor baseline was 7 commits behind upstream head
- License: MIT
- License blob: `924ec1a017b4f95b4f35c725f37db00ffc523ddf`
- License copyright: Copyright (c) 2025 Prince Canuma and contributors
- Swift configuration observed: Swift 6.3, arm64, macOS 26 deployment target for primary targets

### Verified source capabilities selected for evaluation/extraction

- `NativServerKit` native runtime/service boundary
- MLX / bundled mlx-vlm serving architecture
- Hugging Face model discovery and model management
- Local OpenAI-compatible and Anthropic-compatible API surfaces
- Chat / responses, images, audio and embeddings clients
- Runtime health and metrics
- System CPU/GPU/unified-memory monitoring
- MCP client/configuration support
- Extension SDK patterns where useful

## Freshness policy

A and B are moving upstream projects. Code Fusion does not automatically merge upstream changes into an active fusion branch.

1. This baseline remains immutable evidence of the starting point.
2. Upstream changes are reviewed as explicit integration work.
3. Before extracting a B component, compare its donor baseline path with current upstream and decide whether to extract from the frozen donor baseline or deliberately advance the donor baseline.
4. Record every deliberate donor-baseline advancement in `ATTRIBUTIONS.md` and this file.
5. Never silently mix source from multiple upstream revisions inside one extraction without documenting it.

## Verification state

| Check | A | B |
| --- | --- | --- |
| Repository parent verified | VERIFIED-SOURCE | VERIFIED-SOURCE |
| Baseline SHA recorded | VERIFIED-SOURCE | VERIFIED-SOURCE |
| License recorded | VERIFIED-SOURCE | VERIFIED-SOURCE |
| Source architecture inspected | IN PROGRESS | IN PROGRESS |
| Clean local build on macOS | NOT TESTED | NOT TESTED |
| Automated baseline tests | NOT TESTED | NOT TESTED |
| Runtime smoke test | NOT TESTED | NOT TESTED |

The local build/test rows remain `NOT TESTED` until executed on an appropriate machine. Source inspection must never be promoted into a build or runtime pass.
