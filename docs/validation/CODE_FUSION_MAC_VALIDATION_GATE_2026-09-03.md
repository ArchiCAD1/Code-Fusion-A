# Code Fusion — Consolidated Mac / CI Validation Gate

Date: 2026-09-03  
Status: **READY TO EXECUTE / NOT YET VERIFIED**  
Canonical validation branch: `codefusion/validation-gate-2026-09-03`

## Purpose

Run the missing full-repository and macOS validation for the current Code Fusion architecture stack
before any draft PR is merged, any Orchestration Ledger service is mounted into Electron lifecycle,
or any visible/mutating Model Hub surface is opened.

GitHub Issues are disabled in Code-Fusion-A, so this version-controlled document is the authoritative
execution ledger for the validation wave. Update it in place with exact environments, commands,
counts, failures, fixes, commits, and evidence.

## Current source heads

### Code-Fusion-A

| PR | Layer | Branch | Head |
|---|---|---|---|
| #1 | Architecture foundation | `codefusion/architecture-foundation` | `5ea646b592757f62a884c27ccb41f28a2c615f8b` |
| #2 | Read-only native-intelligence IPC | `codefusion/ipc-integration-wave` | `669cc9d9a47748024c8063fcae9a4296694043e6` |
| #5 | Native inventory/read-contract hardening | `codefusion/native-inventory-hardening` | `3a275db154bcb7e9aee3d83327bf1d305514784b` |
| #3 | SQLite ledger foundation | `codefusion/orchestration-ledger-foundation` | `23b0c3eeb24911285a88b544734649e88d1260b1` |
| #4 | Ledger worker boundary | `codefusion/orchestration-ledger-worker` | `19aea6bac1ad9f3e1a035cb440a6be265161d13a` |
| #6 | Bounded ledger lifecycle owner | `codefusion/orchestration-ledger-lifecycle` | `13f0c01f16cb3a9a1114d350552354c247880059` |
| #7 | Profile-scoped ledger registry | `codefusion/orchestration-ledger-runtime-registry` | `b1979aa9f60592db202831970b99979eb74ccbae` |
| #8 | Dormant main-process composition | `codefusion/orchestration-ledger-main-process-composition` | `d42413411139cfaa4486a66ba7c3fcb3bfa28724` |
| #9 | Renderer-safe Model Hub contract | `codefusion/model-hub-contract-foundation` | `b93119e2a197295dfe975bcdac3cfbeafcbc5e21` |

### Code-Fusion-B

| Item | Ref | Head |
|---|---|---|
| Frozen donor baseline | `main` | `64dadb98ee61c3687044d3cc54eebe3f5b36fbea` |
| Current donor refresh | PR #2 / `codefusion/nativ-upstream-refresh-2026-09-03` | `2622950142db0443e37a7d0bd422e3f719c3cc2a` |
| Reviewed Nativ upstream within refresh | upstream source | `e7679818e14851e4a9c4c910286e81dc5f3d50bb` |

Do not silently substitute a newer head. If a branch moves, record the new SHA before running any
validation.

## Evidence vocabulary

Classify every result as exactly one of:

- `VERIFIED-SOURCE`
- `VERIFIED-AUTOMATED`
- `VERIFIED-BUILD`
- `VERIFIED-RUNTIME`
- `FAIL`
- `NOT TESTED`
- `DEFERRED`

Source inspection, a mergeable PR, or an isolated focused harness is not a full repository or runtime
pass.

---

## Gate 0 — Environment and repository integrity

- [ ] Record macOS version, Mac model/chip, RAM, Xcode version, Swift version, Node version, pnpm version, Python version, XcodeGen version, and Git version.
- [ ] Verify both repositories have clean working trees before starting.
- [ ] Verify `main` in A and B has not been modified.
- [ ] Verify all target SHAs above still match their branches/PRs.
- [ ] Confirm no other agent is editing the same worktree.
- [ ] Enable or diagnose GitHub Actions for the forks; record why no checks currently run if it cannot be enabled.

## Gate A1 — Code-Fusion-A architecture baseline

Checkout PR #1 / `codefusion/architecture-foundation` at the recorded SHA.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm lint
pnpm build:desktop
```

- [ ] Record exact test files/suites/pass/fail/skip counts and warnings.
- [ ] Confirm no Nativ app UI or substantive donor source was copied into A.

## Gate A2 — Native-intelligence read stack

Use PR #5 (`codefusion/native-inventory-hardening`), which includes PR #2.

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build:desktop
```

- [ ] Run focused tests for provider, IPC, preload, renderer state, presentation selectors, certification, inventory bounds, and smoke helpers.
- [ ] Verify renderer exposure remains limited to `getSnapshot()` and bounded `runReadCertification()`.
- [ ] Verify endpoint, API key, raw filesystem path, process ID, arbitrary shell, and model mutations cannot cross preload.
- [ ] With Nativ stopped, run `node scripts/code-fusion/verify-nativ-read-contract.mjs` and record the expected nonzero/unavailable result.

## Gate A3 — Orchestration Ledger full stack

Use PR #8 (`codefusion/orchestration-ledger-main-process-composition`), which includes PRs #3, #4,
#6, and #7.

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build:desktop
```

- [ ] Run focused ledger store, canonical event, service, worker protocol/client/factory, lifecycle owner, registry, and composition tests.
- [ ] Build the worker entry through the PR #4 Code Fusion electron-vite integration config.
- [ ] Run `node scripts/code-fusion/verify-ledger-worker-build.mjs`.
- [ ] Verify schema version 1, append/read ordering, transactional rollback, durable reopen, payload guards, duplicate event handling, and secure file permissions.
- [ ] Verify missing worker output fails closed and never falls back to main-thread SQLite.
- [ ] Verify unused owner/registry/controller construction creates no worker or ledger file.
- [ ] Verify the dormant controller is not imported into live Electron startup/profile-switch/quit behavior.
- [ ] Verify fatal-disposal evidence wins if graceful shutdown resolves afterward.

## Gate A4 — Model Hub contract

Checkout PR #9 / `codefusion/model-hub-contract-foundation`.

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build:desktop
```

- [ ] Run focused Model Hub contract tests.
- [ ] Verify catalog bounds, ID normalization, opaque storage target IDs, lifecycle states, retryability-aware actions, safe-integer progress, and error redaction.
- [ ] Verify no token, API key, raw path, volume UUID, Python script, signal, process ID, native handle, mutation IPC, or visible Model Hub UI was added.

## Gate B1 — Frozen Nativ donor baseline

Checkout Code-Fusion-B `main` at `64dadb98ee61c3687044d3cc54eebe3f5b36fbea`.

```bash
make xcode-generate
make xcode-build
xcodebuild -project Nativ.xcodeproj -scheme Nativ -configuration Debug \
  -derivedDataPath build/NativDevelopmentDerivedData CODE_SIGNING_ALLOWED=NO test
make xcode-smoke
make xcode-lifecycle-smoke
```

- [ ] Record exact test counts, warnings, and runtime endpoint evidence.

## Gate B2 — Refreshed Nativ donor

Checkout Code-Fusion-B PR #2 at `2622950142db0443e37a7d0bd422e3f719c3cc2a`.

```bash
make xcode-generate
make xcode-build
xcodebuild -project Nativ.xcodeproj -scheme Nativ -configuration Debug \
  -derivedDataPath build/NativDevelopmentDerivedData CODE_SIGNING_ALLOWED=NO test
make xcode-smoke
make xcode-lifecycle-smoke
```

- [ ] Verify the bundled MLX/Python server resource exists and starts.
- [ ] Verify `/health`, `/v1/models`, and `/metrics` with bounded response evidence.
- [ ] Verify no-key, wrong-key, and correct Bearer-key behavior.
- [ ] Verify management routes such as model load remain separately authenticated.
- [ ] Verify additive speculative-drafter kinds (`dflash`, `eagle3`, `mtp`) do not break baseline inventory.

## Gate B3 — Real model lifecycle

Use a disposable compatible model and an approved disposable/existing cache target.

- [ ] Catalog search/filter/sort/pagination.
- [ ] Gated/private model behavior.
- [ ] SafeTensors size and memory-fit estimates.
- [ ] Disk-capacity reservation with active downloads.
- [ ] Start a download and capture progress, speed, and phase evidence.
- [ ] Pause and resume.
- [ ] Interrupt the app/process and verify resumable `.incomplete` data is preserved.
- [ ] Trigger or simulate a retryable stall and confirm bounded retry behavior.
- [ ] Complete validation.
- [ ] Load, query, unload, and remove the model.
- [ ] Verify external-cache disconnect/reconnect and volume-identity mismatch handling.
- [ ] Verify secrets and raw subprocess output are absent from user-facing evidence.

## Gate C — Code-Fusion-A ↔ refreshed Code-Fusion-B compatibility

Run refreshed Nativ and Code-Fusion-A PR #5 on the same Mac.

- [ ] `getSnapshot()` reports accurate health and model inventory.
- [ ] `runReadCertification()` produces explicit runtime-ready and inventory checks.
- [ ] Stop Nativ and verify unavailable state without crash or fabricated stale success.
- [ ] Restart Nativ and verify recovery.
- [ ] Test zero, one, and multiple visible models.
- [ ] Test missing/incorrect/correct authorization.
- [ ] Confirm no endpoint, credential, raw path, or mutation capability enters renderer state.

## Gate D — Packaged lifecycle and profile isolation

- [ ] Build a development Code Fusion package containing the ledger worker entry.
- [ ] Verify worker path resolution in development and packaged layouts.
- [ ] Verify two profile directories create isolated ledgers.
- [ ] Verify profile release blocks identity reuse until bounded close completes.
- [ ] Verify graceful shutdown begins before the final `will-quit` barrier.
- [ ] Keep `will-quit` limited to immediate/final cleanup; do not add unbounded synchronous SQLite work.
- [ ] Verify a wedged worker reaches timeout disposal and cannot keep Code Fusion alive.
- [ ] Relaunch and verify durable ledger reopen after clean shutdown.

## Repair discipline

For every failure:

1. Reproduce it on the exact recorded SHA.
2. Identify the root cause.
3. Fix only the owning branch/layer.
4. Add or strengthen a regression test.
5. Run the focused test.
6. Run the full repository suite.
7. Re-run the Mac/runtime scenario.
8. Update the corresponding PR body and this document with exact evidence.

Do not weaken, skip, delete, or rewrite tests merely to obtain a green result.

## Promotion rules

- [ ] No PR is merged solely because GitHub reports it mergeable.
- [ ] Do not merge PR #9 before Gate A4 passes.
- [ ] Do not merge Code-Fusion-B PR #2 before Gates B1-B3 and C pass.
- [ ] Do not mount the ledger controller into startup/profile-switch/quit until Gates A3 and D pass.
- [ ] Do not add Model Hub mutation IPC or visible mutation controls until Gates A4, B3, and C pass.
- [ ] Update `CODE_FUSION_MASTER_DEVELOPMENT_PLAN.html` in place after evidence is recorded.

## Final report format

Provide:

- exact tested SHAs;
- environment/toolchain;
- commands;
- full and focused test counts;
- build/package results;
- runtime evidence;
- defects and fixes;
- remaining `NOT TESTED` / `DEFERRED` items;
- recommendation for each PR: keep draft, ready for review, or blocked.
