# Code Fusion Orchestration Ledger Lifecycle Gate

## Status

`VERIFIED-SOURCE` with focused lifecycle tests included. Full repository typecheck/Vitest, emitted-worker smoke, Electron lifecycle mounting, packaged macOS behavior, and durable close during real application shutdown remain `NOT YET VERIFIED`.

## Purpose

The orchestration ledger uses synchronous SQLite inside an isolated worker thread. This lifecycle layer owns that worker client without moving SQLite back onto Electron's main thread or inserting unbounded synchronous work into Orca's existing `will-quit` barrier.

## Runtime-owner guarantees

- Construction is side-effect free.
- The worker client is created only when a real ledger consumer requests it.
- The worker itself remains lazy until the first ledger operation.
- A failed client construction leaves the owner idle so an explicit later access can retry.
- Repeated shutdown calls share one in-flight promise.
- Graceful shutdown first drains accepted worker requests and closes SQLite in the worker.
- Graceful close has a strict default deadline of 3 seconds.
- Timeout or close failure falls back to fail-closed worker disposal.
- Credential-like text is redacted from shutdown reports.
- Closing an unused owner creates no worker and no ledger sidecar.
- Immediate disposal is available for fatal teardown paths.

## Explicit non-goals in this change

This branch does not:

- mount the owner in Electron startup;
- install `before-quit`, `will-quit`, or `exit` listeners;
- create live agent/build/test event producers;
- expose ledger APIs to renderer, mobile, MCP, or external clients;
- rewrite Orca's existing profile/session persistence;
- claim durable shutdown from source inspection alone.

## Required promotion evidence

Before application lifecycle mounting is promoted, run all of the following against the built Code Fusion application:

1. Full TypeScript typecheck and repository Vitest suite.
2. Development worker emission plus `verify-ledger-worker-build.mjs`.
3. Packaged worker path smoke on macOS.
4. Start Code Fusion without using the ledger and confirm no ledger file is created.
5. Perform one ledger append/read and confirm the worker owns SQLite.
6. Quit during idle, active read, active write, and queued work.
7. Verify graceful close completes within the deadline under normal conditions.
8. Fault-inject a stalled worker and verify the app is not held open indefinitely.
9. Reopen and verify committed records, sequence monotonicity, and SQLite integrity.
10. Confirm no synchronous SQLite work occurs on Electron's main thread.

## Next integration decision

Application mounting should use this owner from a main-process runtime composition point that has the active profile's `profileDirectory`. A later integration must begin graceful shutdown before the final synchronous teardown barrier and retain immediate disposal only as the bounded fallback. That integration is intentionally separate from this source-only lifecycle change.
