# Code Fusion Orchestration Ledger Worker Boundary

Status: **VERIFIED-SOURCE / FOCUSED-AUTOMATED; full repository and packaged runtime pending**

## Purpose

The orchestration ledger's SQLite implementation is synchronous by design. This boundary moves
ledger reads, appends, transactions, migrations, and close/checkpoint work onto a dedicated Node
worker thread so Electron's main event loop never owns SQLite latency.

## Current scope

This change establishes the worker protocol, worker-side execution adapter, worker entrypoint,
asynchronous main-process client, and focused tests. The client requires an injected worker factory.
The final built-entry resolver and Electron lifecycle mounting remain separate follow-up gates so this
foundation does not silently assume an unverified packaged path.

## Safety properties

- The client is lazy: construction, empty batch append, and closing an unused client create no worker
  and no ledger file.
- Requests are serialized FIFO. A deadline starts only when a request is actually dispatched.
- Active plus queued requests are bounded at 256.
- The protocol validates operation-specific payload shapes before the worker executes them.
- A worker fault rejects the active request and every queued request without replay. Callers must
  explicitly decide whether an uncertain write is safe to retry.
- Later requests may start a fresh worker after a fault.
- The worker is `unref()`'d and cannot keep Code Fusion alive by itself.
- Graceful `close()` drains accepted work, closes SQLite inside the worker, acknowledges completion,
  and terminates the worker.
- Immediate `dispose()` rejects pending work and terminates without opening a previously idle ledger.
- Worker error messages are length-bounded and redact Bearer, token, API-key, and authorization data.
- The protocol exposes only typed ledger operations. It contains no shell, arbitrary SQL, endpoint,
  credential, renderer, or file-operation surface.

## Lifecycle decision

This boundary is intentionally **not** mounted into application startup or `will-quit` yet.
The existing Code Fusion/Orca teardown path is designed to avoid unbounded synchronous filesystem
stalls. A future lifecycle integration may await `close()` at an earlier bounded shutdown phase and
use `dispose()` only as the final `will-quit` fallback; it must not synchronously wait for SQLite
inside the quit barrier.

## Packaging gate

The worker entry must become a stable CommonJS main-build entry before the default worker factory is
introduced. Development and packaged paths must both be tested. Existing Code Fusion precedent uses
explicit `electron.vite.config.ts` entries for worker threads such as the port-scan worker.

## Verification still required

1. Full repository TypeScript and Vitest suites.
2. Electron development build confirms the worker entry is emitted.
3. Packaged macOS build confirms `Worker` can load the entry from the chosen app/asar path.
4. Real SQLite append/read/close on the worker while the main event loop remains responsive.
5. Worker crash, timeout, queue pressure, and application-quit fault injection.
6. Active-profile lifecycle ownership before live agent/build/test event producers are connected.
7. No renderer or mobile exposure until read/write permissions and data projections are separately
   designed and reviewed.
