# Code Fusion Native Runtime Alpha — Mac Test Checklist

Date: 2026-09-05  
Branch: `codefusion/testable-alpha-2026-09-05`  
Scope: read-only native runtime/model discovery and mounted-app certification

## Alpha boundary

This build is intentionally read-only for native model lifecycle operations. It must not expose model download, load, unload, remove, or credential-editing controls. The Orchestration Ledger remains on its separate development branch and is not required for this alpha.

## 1. Prepare the checkout

```bash
git fetch origin
git switch codefusion/testable-alpha-2026-09-05
git pull --ff-only
```

If dependencies are not already installed, use the repository's normal pnpm bootstrap/install workflow before continuing.

## 2. Start the native runtime

Start the Nativ-compatible local runtime on its default loopback endpoint:

```text
http://127.0.0.1:8080
```

Verify the read-only model endpoint before launching Code Fusion:

```bash
curl --fail --show-error http://127.0.0.1:8080/v1/models
```

If the local runtime requires Bearer authentication, keep the token in the approved local secret boundary and never put it in the URL or screenshots.

Expected: a successful OpenAI-style model-list response from `/v1/models`.

## 3. Run source/build gates on the Mac

```bash
pnpm run typecheck
pnpm run test
pnpm run build:electron-vite
```

Record each result separately. A source/typecheck pass is not a runtime pass.

## 4. Launch the mounted desktop app

For the fastest development verification:

```bash
pnpm dev
```

For a local macOS package/build gate when time permits:

```bash
pnpm run build:mac
```

## 5. Verify the Code Fusion Models surface

1. Launch Code Fusion and open any normal workspace.
2. Click the CPU/Models button in the titlebar.
3. Confirm the dialog title is **Models & Native Runtime** and it is marked **Read-only alpha**.
4. Confirm the runtime name, state, protocol version, capabilities, refresh timestamp, and model counts are visible.
5. Confirm the model inventory lists the model display name/ID, lifecycle state, source, and capabilities.
6. Click **Refresh** and verify the refresh state completes without freezing the IDE, terminals, or editor.
7. Confirm there are no model download/load/unload/delete controls.

## 6. Run mounted read certification

1. In **Models & Native Runtime**, click **Run Read Certification**.
2. Confirm the report contains the `runtime-ready` and `model-inventory` checks.
3. With the native runtime healthy, confirm the overall result is `PASS`.
4. Capture a screenshot showing the report and model count.

Only this mounted Mac run may promote this scenario to `verified-runtime`.

## 7. Failure and recovery test

1. Stop the Nativ-compatible runtime.
2. Click **Refresh**.
3. Confirm Code Fusion reports unavailable/failed/degraded state without crashing or hanging.
4. Run **Read Certification** and confirm it fails cleanly with a bounded, non-secret error.
5. Restart the native runtime.
6. Click **Refresh** again.
7. Confirm the runtime and model inventory recover without restarting Code Fusion.

## 8. Regression smoke

Before accepting the alpha, verify these inherited Code Fusion/Orca basics still work:

- open/switch a project or folder workspace
- open a terminal
- create or switch an agent/worktree if available in the test environment
- open an editor tab
- toggle the right sidebar
- close and relaunch the app

## Evidence record

Record results using the project vocabulary:

- `verified-source`
- `verified-build`
- `verified-automated`
- `verified-runtime`
- `fail`
- `not-tested`
- `deferred`

Do not promote a source, TypeScript, unit-test, or Linux result into a macOS runtime pass.
