# Code Fusion Testing Alpha

This branch is the first intentionally testable Code Fusion desktop alpha. It is based on the read-only native-intelligence integration and adds a visible Local AI Runtime surface under Settings > Advanced.

## Scope

The alpha proves one bounded product path:

Code Fusion renderer -> typed preload API -> Electron main IPC -> bounded Nativ-compatible provider -> local loopback runtime.

The surface can refresh runtime state, list the reported local model inventory, and run the bounded read-only certification checks for runtime readiness and model inventory. The alpha also carries the native-inventory trust-boundary hardening and the standalone read-contract smoke adopted from PR #5.

This alpha does **not** enable model download, load, unload, removal, credential editing, arbitrary shell/process control, or Orchestration Ledger mounting.

## Mac prerequisites

- Apple silicon Mac.
- macOS 26 or newer for the Nativ donor runtime.
- Node 24 for Code Fusion A.
- pnpm 12.0.0 (the repository-pinned package manager).
- Xcode with the macOS 26 SDK if building Code Fusion B / Nativ from source.

Confirm the Code Fusion toolchain before installing dependencies:

```sh
node --version
corepack --version
```

## 1. Prepare the local native runtime

For this alpha, use the default Nativ server address:

`http://127.0.0.1:8080`

The mounted alpha startup path does not inject a server API key yet. Disable Nativ server API-key enforcement for the mounted Code Fusion test run. Do not expose the server beyond loopback.

### Option A — installed Nativ app

Launch Nativ, keep its server on `127.0.0.1:8080`, disable API-key enforcement for this alpha run, and start the local server.

### Option B — Code-Fusion-B source checkout

From the Code-Fusion-B checkout:

```sh
brew install xcodegen
make xcode-generate
make xcode-run
```

The first source build can take longer because the embedded Python/MLX runtime may need to be assembled.

## 2. Run the standalone native read-contract preflight

From the Code-Fusion-A checkout, first verify the raw model-list endpoint:

```sh
curl -fsS http://127.0.0.1:8080/v1/models
```

Expected: an OpenAI-style JSON model-list response. An empty `data` array is acceptable if the server is healthy and no compatible model is installed.

Then run the version-controlled bounded smoke:

```sh
node scripts/code-fusion/verify-nativ-read-contract.mjs \
  --base-url http://127.0.0.1:8080/ \
  --timeout-ms 5000
```

The smoke performs GET-only checks against `/v1/models`, `/health`, and `/metrics`, bounds every response to 1 MiB, caps model inventory at 4,096 entries, bounds model IDs, deduplicates IDs, redacts credential-like values, and exits nonzero if any check fails.

If separately testing an authenticated standalone runtime, the smoke can read a Bearer token from a named environment variable:

```sh
NATIV_API_KEY='your-local-test-key' \
node scripts/code-fusion/verify-nativ-read-contract.mjs --api-key-env NATIV_API_KEY
```

Do not use that authenticated configuration for the mounted alpha yet; the Electron provider intentionally has no renderer-visible credential path.

## 3. Prepare and validate Code Fusion testing alpha

```sh
git fetch origin
git switch codefusion/testing-alpha
git pull --ff-only
corepack enable
corepack prepare pnpm@12.0.0 --activate
pnpm install --frozen-lockfile
```

Run the fast pre-launch gates:

```sh
pnpm run verify:localization-coverage
pnpm run verify:localization-extraction
pnpm run typecheck
pnpm test -- \
  scripts/code-fusion/verify-nativ-read-contract.test.ts \
  src/main/code-fusion/nativ-native-intelligence-provider.test.ts \
  src/main/code-fusion/native-intelligence-read-model.test.ts \
  src/main/code-fusion/native-intelligence-certification.test.ts \
  src/renderer/src/store/slices/native-intelligence-state.test.ts \
  src/renderer/src/store/slices/native-intelligence-presentation.test.ts \
  src/renderer/src/components/settings/NativeIntelligenceRuntimeSection.test.tsx
pnpm run build:electron-vite
```

If any command fails, stop there and preserve the complete output before changing runtime state. GitHub Actions still have not executed on this fork, so the local Mac output is required evidence.

## 4. Launch Code Fusion

```sh
pnpm run dev
```

Open Code Fusion and go to:

**Settings -> Advanced -> Local AI Runtime**

Check the following:

1. The app launches without a new startup crash.
2. The runtime card appears at the top of Advanced settings.
3. With Nativ running, status becomes `Local AI ready`.
4. Model, Installed, and Loaded counts render without layout errors.
5. Installed models reported by `/v1/models` appear once in Model inventory; duplicate or oversized IDs must not leak through.
6. Refresh updates the state without opening a second window or freezing the app.
7. Run Certification reports checks for Runtime readiness and Model inventory.
8. Stop the Nativ server, press Refresh, and verify Code Fusion reports the runtime unavailable rather than crashing.
9. Restart Nativ, press Refresh, and verify the runtime returns to ready.
10. Confirm there are no model download/load/unload/remove buttons and no runtime credential editor in this alpha.

## 5. Evidence to capture

For the first mounted Mac certification, retain:

- `git rev-parse HEAD` for Code Fusion testing-alpha.
- Code-Fusion-B / Nativ commit SHA or installed Nativ version.
- macOS version and Mac model / Apple silicon generation.
- standalone read-contract smoke JSON output.
- localization coverage + extraction results.
- `pnpm run typecheck` result.
- focused native-intelligence Vitest result.
- `pnpm run build:electron-vite` result.
- screenshot of the Local AI Runtime surface in ready state.
- screenshot of Run Certification result.
- one unavailable -> ready recovery cycle result.
- any crash, console error, or UI regression encountered.

A passing standalone smoke may be classified `VERIFIED-RUNTIME-FOCUSED` for that runtime instance. Do not label the mounted Code Fusion path `VERIFIED-RUNTIME` until the Electron checks above pass on the Mac.

## Current alpha boundary

The Orchestration Ledger remains on its separate backend branches. Parallel work has already moved it behind a worker boundary and added lifecycle/registry/controller foundations, but keeping it out of this launch branch remains deliberate: it adds no immediate visible test value and would increase integration scope before the native-runtime alpha itself has a mounted pass.
