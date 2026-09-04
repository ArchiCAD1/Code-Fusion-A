# Code Fusion Ledger Worker Build Smoke

Status: **READY TO RUN; no build or runtime pass claimed yet**

This smoke test verifies the separately emitted orchestration-ledger worker against a real temporary
SQLite sidecar. It does not mount the ledger into the application lifecycle or write live Code Fusion
agent/build/test events.

## Run

```bash
pnpm exec electron-vite build --config electron.vite.codefusion.config.ts
node scripts/code-fusion/verify-ledger-worker-build.mjs
```

An explicit worker path may be supplied as the first argument:

```bash
node scripts/code-fusion/verify-ledger-worker-build.mjs \
  out/main/orchestration-ledger-worker-entry.js
```

## Assertions

The script fails unless all of these are true:

1. The separately emitted worker entry exists.
2. The worker starts with only an isolated temporary `profileStorageDirectory`.
3. Schema version 1 is readable.
4. A canonical `task.created` event appends successfully.
5. Core event ownership derives aggregate type `task`.
6. Aggregate read returns exactly the appended event.
7. Latest sequence matches the appended record.
8. Graceful `close` completes inside the worker.
9. `code-fusion-ledger.sqlite3` exists and is non-empty after close.

The temporary profile directory is deleted after the result is printed. A passing output is classified
as **VERIFIED-BUILD / VERIFIED-RUNTIME-FOCUSED** for the worker boundary only. It is not evidence that
the full Electron application, packaged macOS app, live event producers, renderer/mobile projections,
or full repository suite have passed.

## Packaged smoke still required

The development smoke uses `out/main/orchestration-ledger-worker-entry.js`. A packaged macOS gate must
separately prove the worker can load from the chosen `app.asar/out/main` path before the entry is
promoted into the canonical build config or application lifecycle.
