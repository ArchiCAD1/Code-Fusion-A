# Code Fusion Attributions

Code Fusion is developed from and with reference to open-source software. This file records source provenance for substantial upstream components and must remain current as code is extracted, modified, or replaced.

## Orca

- Upstream: https://github.com/stablyai/orca
- Code Fusion fork: https://github.com/ArchiCAD1/Code-Fusion-A
- Phase 0 baseline: `5aa02ead59a4f34a186c3e8814558b5795260ee9`
- License: MIT
- Copyright notice in upstream license: Copyright (c) 2026 Lovecast Inc.

Code-Fusion-A is a GitHub-recognized fork of `stablyai/orca`. Code Fusion retains Orca-derived orchestration, worktree, terminal, editor, browser, mobile, CLI, and computer-use foundations while progressively introducing Code Fusion-specific architecture.

## Nativ

- Upstream: https://github.com/Blaizzy/nativ
- Code Fusion donor fork: https://github.com/ArchiCAD1/Code-Fusion-B
- Phase 0 donor baseline: `64dadb98ee61c3687044d3cc54eebe3f5b36fbea`
- Upstream head observed during Phase 0: `495e9119dae0cf2e4968380d03a73b15786ae506`
- License: MIT
- Copyright notice in upstream license: Copyright (c) 2025 Prince Canuma and contributors

Code-Fusion-B is a GitHub-recognized fork of `Blaizzy/nativ`. Code Fusion will selectively adapt Nativ's native model-runtime, model-management, MLX, Hugging Face, system-monitoring, MCP, and local API architecture. The Nativ SwiftUI application shell is not intended to become a second user-facing Code Fusion application.

## Additional reference donors

### Radiant

- Upstream: https://github.com/templetongroup/radiant
- Reference baseline: `2e8852b4ce91f2ebc05258543bbac75c6b984d9a`
- License: MIT
- Copyright notice: Copyright (c) 2026 Templeton Technologies
- Reference scope: local coding-harness architecture, provider-neutral conversations, agent-loop/context controls, tool safety, mobile patterns, and packaged-app/release verification.

### OpenBot

- Upstream: https://github.com/CopilotKit/OpenBot
- Reference baseline: `06633a4b61c0794d97829c4d856ba4b2da869ab3`
- License: MIT
- Copyright notice: Copyright (c) 2026 CopilotKit
- Reference scope: AG-UI coworker endpoints, action governance, fail-closed policy, per-agent computer isolation, human takeover, MCP grants, and audit trails.

### CopilotKit

- Upstream: https://github.com/CopilotKit/CopilotKit
- Reference baseline: `b17e238aa31a7711879042d9e17fa5801bd40e58`
- License: MIT
- Copyright notice: Copyright (c) Atai Barkai
- Reference scope: AG-UI client/frontend architecture, human-in-the-loop, shared agent/UI state, generative UI, and cross-surface agent interaction.

These additional projects are reference donors, not required Code Fusion runtime dependencies. No source from them is copied by the reference-audit commit. Any later substantive source extraction must add an extraction-ledger row with its exact upstream path and commit.

## Provenance rules

1. Preserve applicable upstream copyright and permission notices.
2. Record the upstream repository, baseline commit, original path, Code Fusion destination, and adaptation notes for substantive source extraction.
3. Prefer interfaces and adapters over copying an entire upstream application shell.
4. Do not imply endorsement by upstream authors or organizations.
5. Re-run the license/provenance audit before every public release candidate.
6. Keep Code-Fusion-B available as a donor/reference implementation until every selected capability is integrated, rejected, or explicitly deferred.

## Extraction ledger

No substantive Nativ, Radiant, OpenBot, or CopilotKit source has been extracted into Code-Fusion-A as of the reference-donor foundation commit. Architecture ideas and independently authored compatibility contracts are recorded as reference work, not copied source.

| Upstream | Upstream commit | Original path | Code Fusion path | Adaptation | Status |
| --- | --- | --- | --- | --- | --- |
| Nativ | `64dadb98ee61c3687044d3cc54eebe3f5b36fbea` | — | — | Architecture/reference only | No source extracted |
| Radiant | `2e8852b4ce91f2ebc05258543bbac75c6b984d9a` | — | — | Architecture/reference only | No source extracted |
| OpenBot | `06633a4b61c0794d97829c4d856ba4b2da869ab3` | — | — | Architecture/reference only | No source extracted |
| CopilotKit | `b17e238aa31a7711879042d9e17fa5801bd40e58` | — | — | Architecture/reference only | No source extracted |
