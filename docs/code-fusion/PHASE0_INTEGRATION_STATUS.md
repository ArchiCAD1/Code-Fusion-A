# Code Fusion Phase 0 Integration Status

Status: IN PROGRESS
Date: 2026-09-01
Branch: `codefusion/architecture-foundation`

This checkpoint records the next integration gate after the read-only Nativ runtime bridge landed at `e954294add8ea126f1385115c2742c4bb95b4d7b`.

## Current verified state

- `Code-Fusion-A` remains the canonical host application.
- `Code-Fusion-B` remains the native-intelligence donor/reference.
- The read-only Nativ adapter is present on the architecture branch.
- The branch is isolated from `main`.
- Full repository CI, full Electron integration, and macOS live-runtime validation are still pending.

## Next gate

Before a Model Hub UI is opened, Code Fusion must expose the existing read-only native-intelligence provider through the existing typed Electron boundary:

1. main-process IPC handler(s)
2. preload API types
3. preload bridge implementation
4. renderer-safe read model
5. focused tests for IPC/preload behavior
6. full repository typecheck/test evidence when available
7. live macOS verification against the Nativ `/v1/models` endpoint

No model download/load/unload/delete mutation is authorized in this increment.
