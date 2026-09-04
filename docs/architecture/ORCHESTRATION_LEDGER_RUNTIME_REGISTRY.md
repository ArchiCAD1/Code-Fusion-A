# Code Fusion Orchestration Ledger Runtime Registry

Status: **VERIFIED-SOURCE; focused/full repository/macOS runtime pending**

## Purpose

The worker client and lifecycle owner establish one safe asynchronous ledger runtime. Code Fusion can
operate more than one profile over its lifetime, so a separate profile registry is required before
Electron startup, profile-switch, or quit mounting.

The registry is intentionally independent of Electron and renderer/mobile state.

## Guarantees

- Construction creates no owner, worker, or SQLite sidecar.
- A normalized profile ID maps to exactly one normalized storage directory while registered or closing.
- Reusing a profile ID with a different directory fails closed.
- Profile owners are created lazily and bounded to 32 by default.
- Owner-construction failure does not retain a poisoned registry entry.
- Duplicate profile release calls share one in-flight shutdown.
- A profile cannot be recreated while its prior owner is closing.
- Aggregate shutdown closes all profiles and returns deterministic profile-sorted evidence.
- One profile failure is isolated and reported without erasing other profile results.
- Fatal disposal is immediate, explicitly non-graceful, and idempotent.
- Error reports redact Bearer, token, API-key, and authorization values.
- No profile storage path is included in shutdown reports.

## Non-goals

This layer does not:

- install Electron lifecycle listeners;
- select the active profile;
- start a worker or open SQLite merely by registering a profile;
- expose ledger operations to renderer, mobile, MCP, or external clients;
- emit live project, agent, build, test, or runtime events;
- replay uncertain writes after worker failure;
- merge native-intelligence and ledger branches.

## Promotion gate

Before mounting the registry into the desktop runtime:

1. Run full repository TypeScript and Vitest suites.
2. Run development and packaged ledger worker smoke tests.
3. Prove two profile directories remain isolated on macOS.
4. Prove profile release blocks identity reuse until close completes.
5. Prove aggregate shutdown completes within the owner deadlines.
6. Confirm Electron profile-switch and quit ordering.
7. Preserve `will-quit` as an immediate final barrier; graceful shutdown must begin earlier.
8. Record source, automated, build, packaged, and runtime evidence separately.
