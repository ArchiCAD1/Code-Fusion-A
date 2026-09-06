# Code Fusion Testing Alpha

This branch is the first intentionally testable Code Fusion desktop alpha. It is based on the read-only native-intelligence integration and adds a visible Local AI Runtime surface under Settings > Advanced.

## Scope

The alpha proves one bounded product path:

Code Fusion renderer -> typed preload API -> Electron main IPC -> Nativ-compatible provider -> local loopback runtime `/v1/models`.

The surface can refresh runtime state, list the reported local model inventory, and run the bounded read-only certification checks for runtime readiness and model inventory.

This alpha does **not** enable model download, load, unload, removal, credential editing, arbitrary shell/process control, or Orchestration Ledger mounting.

## Mac prerequisites

- Apple silicon Mac.
- macOS 26 or newer for the Nativ donor runtime.
- Node 24 for Code Fusion A.
- pnpm 12.0.0 (the repository-pinned package manager).
- Xcode with the macOS 26 SDK if building Code Fusion B / Nativ from source.

## 1. Prepare the local native runtime

For this alpha, use the default Nativ server address:

`http://127.0.0.1:8080`

The alpha startup path does not inject a server API key yet. Disable Nativ server API-key enforcement for this test run. Do not expose the server beyond loopback.

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

Before starting Code Fusion, verify the local endpoint:

```sh
curl -fsS http://127.0.0.1:8080/v1/models
```

Expected: an OpenAI-style JSON model-list response. An empty `data` array is acceptable if the server is healthy and no compatible model is installed.

## 2. Start Code Fusion testing alpha

From the Code-Fusion-A checkout:

```sh
git fetch origin
git switch codefusion/testing-alpha
corepack enable
corepack prepare pnpm@12.0.0 --activate
pnpm install --frozen-lockfile
pnpm run dev
```

For a stronger pre-launch check, run:

```sh
pnpm run typecheck
pnpm test -- src/main/code-fusion src/renderer/src/store/slices/native-intelligence-state.test.ts src/renderer/src/store/slices/native-intelligence-presentation.test.ts src/renderer/src/components/settings/NativeIntelligenceRuntimeSection.test.tsx
```

Repository-wide CI has not executed on this fork, so local Mac output is required evidence.

## 3. Exercise the alpha surface

Open Code Fusion and go to:

**Settings -> Advanced -> Local AI Runtime**

Check the following:

1. The app launches without a new startup crash.
2. The runtime card appears at the top of Advanced settings.
3. With Nativ running, status becomes `Local AI ready`.
4. Model, Installed, and Loaded counts render without layout errors.
5. Installed models reported by `/v1/models` appear in Model inventory.
6. Refresh updates the state without opening a second window or freezing the app.
7. Run Certification reports checks for Runtime readiness and Model inventory.
8. Stop the Nativ server, press Refresh, and verify Code Fusion reports the runtime unavailable rather than crashing.
9. Restart Nativ, press Refresh, and verify the runtime returns to ready.
10. Confirm there are no model download/load/unload/remove buttons and no runtime credential editor in this alpha.

## 4. Evidence to capture

For the first mounted Mac certification, retain:

- Code Fusion testing-alpha commit SHA.
- Code-Fusion-B / Nativ commit SHA or installed Nativ version.
- macOS version and Mac model / Apple silicon generation.
- `pnpm run typecheck` result.
- focused native-intelligence Vitest result.
- screenshot of the Local AI Runtime surface in ready state.
- screenshot of Run Certification result.
- one unavailable -> ready recovery cycle result.
- any crash, console error, or UI regression encountered.

Do not label the runtime `VERIFIED-RUNTIME` until those mounted Mac results exist.

## Current alpha boundary

The Orchestration Ledger remains on its separate backend branch. Keeping it out of this launch branch is deliberate: it adds no visible testing value yet and would increase integration risk before its background SQLite execution/lifecycle strategy is mounted safely.
