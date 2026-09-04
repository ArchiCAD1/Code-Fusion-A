# Code Fusion Orchestration Ledger Worker Packaging Gate

Status: **VERIFIED-SOURCE; development and packaged build/runtime pending**

## Purpose

The worker boundary introduced in the preceding commit intentionally required an injected worker
factory. This follow-up adds the production path resolver/factory and a temporary integration-build
configuration that emits the worker as a stable CommonJS main entry.

## Build entry

Use the Code Fusion integration config while validating this branch:

```bash
pnpm exec electron-vite build --config electron.vite.codefusion.config.ts
```

The wrapper imports and preserves the inherited `electron.vite.config.ts`, then adds only:

```text
orchestration-ledger-worker-entry.js
```

from:

```text
src/main/code-fusion/orchestration-ledger/orchestration-ledger-worker-entry.ts
```

This avoids rewriting the large upstream build configuration before the worker proof is complete.
Once development and packaged smoke tests pass, the entry can be promoted into the canonical config.

## Runtime resolution

The production factory resolves:

- development: `__dirname/orchestration-ledger-worker-entry.js`
- packaged Electron: `process.resourcesPath/app.asar/out/main/orchestration-ledger-worker-entry.js`

The packaged path intentionally mirrors the existing port-scan worker convention. If the entry does
not exist, the factory throws synchronously and the client fails closed. It never falls back to
synchronous SQLite on Electron's main thread.

Only `profileStorageDirectory` crosses into `workerData`. No renderer data, credentials, shell
commands, arbitrary SQL, runtime endpoints, or file-operation permissions are introduced.

## Required evidence before lifecycle mounting

1. Full repository TypeScript and Vitest suites.
2. Integration build emits the expected CommonJS entry.
3. Development Electron smoke starts the worker and completes schema/read/append/close operations.
4. Packaged macOS smoke proves the Worker can load the entry through the chosen asar path.
5. Main-loop responsiveness under large ledger reads/appends.
6. Timeout, worker crash, uncertain write, queue-pressure, and graceful-close fault injection.
7. Only after those gates: choose an earlier bounded lifecycle close point; retain immediate
   `dispose()` as a non-blocking final-quit fallback.
