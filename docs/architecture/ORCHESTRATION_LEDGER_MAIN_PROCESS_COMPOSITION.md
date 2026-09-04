# Code Fusion Main-Process Orchestration Ledger Composition

Status: **VERIFIED-SOURCE; focused/full repository/macOS runtime pending**

## Purpose

This layer provides one dormant main-process composition point above the profile-scoped
Orchestration Ledger runtime registry.

Importing the module allocates only a controller object. It does not create a registry, lifecycle
owner, worker client, worker thread, SQLite connection, or `code-fusion-ledger.sqlite3` sidecar.

## Responsibilities

- lazily create and retain one profile-scoped runtime registry;
- route an active profile's `profile.id` and `profileDirectory` into the registry;
- keep missing-profile failures ahead of registry allocation;
- support profile release without creating an unused registry;
- share one aggregate shutdown operation;
- retain deterministic shutdown evidence;
- fail closed through registry disposal if aggregate shutdown rejects;
- redact credential-like values in composition-level failure reports;
- expose an immediate fatal-disposal fallback;
- reject new access after closing or shutdown.

## Explicit non-goals

This change does not:

- import or modify Electron lifecycle APIs;
- add a field to the inherited Orca `mainProcessState` composition object;
- register startup, profile-switch, `before-quit`, `will-quit`, or `exit` listeners;
- request an active profile automatically;
- open SQLite or spawn a worker on module import;
- expose ledger APIs to renderer, mobile, MCP, plugins, or external clients;
- emit live project, task, agent, build, test, runtime, defect, evidence, or approval events;
- merge the native-intelligence integration track;
- modify `main`.

## Why a separate controller

The existing Orca startup architecture owns services through explicit composition stages. The
ledger now has four independently reviewable layers:

1. append-only SQLite store and canonical event contract;
2. asynchronous worker protocol/client/factory;
3. bounded per-profile lifecycle owner;
4. profile-scoped runtime registry;
5. this dormant process-level controller.

Keeping this controller independent from the inherited `mainProcessState` object avoids changing
application behavior before repository and packaged-worker validation are available. A later
integration can either place the controller in that composition root or import the process-wide
singleton from a narrowly reviewed startup module.

## Promotion gate

Before wiring the controller into live startup/profile-switch/quit behavior:

1. run full repository TypeScript and Vitest suites for PRs #3, #4, #6, #7, and this child PR;
2. build the development worker entry and verify its resolved path;
3. run development and packaged worker smoke tests;
4. verify two profile directories remain isolated on macOS;
5. verify release prevents profile identity reuse until bounded close completes;
6. choose the exact startup composition point after `activeOrcaProfile` is established;
7. start graceful aggregate shutdown before the final `will-quit` barrier;
8. keep `will-quit` limited to immediate disposal/final cleanup;
9. record source, focused, full-suite, build, packaged, and runtime evidence separately.
