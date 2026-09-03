# Native Intelligence macOS Certification

Status: `NEEDS-MAC-RUNTIME`

This procedure certifies the first Code Fusion read-only native-intelligence path against a real Nativ-compatible runtime on macOS. It does not authorize model mutation, downloading, deletion, shell access, or public-network endpoints.

## Scope

The certification path is:

```text
Nativ-compatible runtime
  -> loopback /v1/models
  -> NativNativeIntelligenceProvider
  -> readNativeIntelligenceSnapshot / runNativeIntelligenceReadCertification
  -> nativeIntelligence:* IPC
  -> preload NativeIntelligenceApi
  -> renderer window.api.nativeIntelligence
```

The native provider and renderer boundary are intentionally different in capability. The provider contract reserves future lifecycle operations, while the renderer currently receives only read-only snapshot and certification operations.

## Evidence classification

Do not promote evidence between these classes.

| Evidence | Classification |
| --- | --- |
| Source inspection and type contracts | `VERIFIED-SOURCE` |
| Isolated TypeScript/unit/focused harness | `VERIFIED-AUTOMATED · FOCUSED` |
| Full repository typecheck/test on a supported host | `VERIFIED-AUTOMATED` |
| Successful macOS Code Fusion build | `VERIFIED-BUILD` |
| Live Nativ + mounted Code Fusion bridge checks below | `VERIFIED-RUNTIME` |

A source or Linux-focused pass is never a macOS runtime pass.

## Preconditions

1. Apple Silicon Mac supported by the selected Nativ/MLX runtime.
2. Code-Fusion-A checked out at the exact certification candidate SHA.
3. Code-Fusion-B/Nativ runtime available from the frozen donor or a deliberately recorded newer donor baseline.
4. Nativ runtime listens on a clean loopback origin. Current Code Fusion default: `http://127.0.0.1:8080/`.
5. If the local runtime requires a Bearer token, keep it in the approved host-side secret path. Do not paste it into renderer state, screenshots, logs, or this document.

## Gate A — Code Fusion repository validation

Record the candidate SHA and run the repository's canonical dependency install, typecheck, focused tests, and applicable build command on the Mac. Preserve the complete commands and result summary as evidence.

Pass criteria:

- dependency installation succeeds;
- repository typecheck succeeds;
- native-intelligence provider/read-model/state/presentation/certification tests pass;
- macOS development build succeeds;
- no new warnings indicate missing native-intelligence imports, preload typing, IPC registration, or Electron network setup.

Failure classification: `FAIL-BUILD` or `FAIL-AUTOMATED`; do not continue to runtime promotion until repaired.

## Gate B — Standalone Nativ readiness

With Code Fusion closed, start the Nativ-compatible runtime normally. Confirm the read-only OpenAI-compatible model endpoint on loopback.

Expected endpoint:

```text
GET http://127.0.0.1:8080/v1/models
```

Expected semantics:

- HTTP success;
- JSON object containing a `data` array;
- every accepted model row has a non-empty string `id`;
- an empty `data` array is valid if no compatible models are installed;
- no credential is printed to evidence.

If authentication is enabled, send the Bearer value only from a secret environment/keychain path and redact it from captured output.

## Gate C — Code Fusion bridge while runtime is ready

Launch the Code Fusion development build from the same candidate SHA while the Nativ runtime is ready.

From an authorized development/E2E renderer context, evaluate:

```js
await window.api.nativeIntelligence.getSnapshot()
```

Pass criteria:

- call resolves without renderer or main-process crash;
- `health.protocolVersion === 1`;
- `health.state === "ready"`;
- `health.runtimeName` identifies the Nativ-compatible local runtime;
- `models` is an array;
- `refreshedAt` is a parseable ISO timestamp;
- `modelInventoryError` is absent for a healthy inventory;
- renderer result contains no endpoint, API key, Authorization value, process-control handle, or mutation method.

Record model count and sanitized model IDs only when they are useful to prove parity with Gate B.

## Gate D — Runtime unavailable behavior

Quit the Nativ runtime while Code Fusion remains open, then request a fresh snapshot.

Pass criteria:

- Code Fusion remains alive;
- snapshot resolves with `health.state === "unavailable"` or another truthful non-ready state;
- `models` is empty for an unavailable runtime;
- no stale inventory is manufactured as a fresh success;
- no secret-bearing network error reaches renderer-visible state.

## Gate E — Recovery after restart

Restart the same Nativ runtime without restarting Code Fusion and request another fresh snapshot.

Pass criteria:

- Code Fusion recovers to `health.state === "ready"`;
- model inventory is readable again;
- the provider uses the current host HTTP client after restart;
- repeated requests do not require application relaunch.

Run the stop/start recovery sequence at least three times for the first certification candidate.

## Gate F — Mounted read-only certification report

With the real runtime ready and the same Code Fusion build mounted, evaluate:

```js
await window.api.nativeIntelligence.runReadCertification()
```

Pass criteria:

- `result === "pass"`;
- the `runtime-ready` check passes;
- the `model-inventory` check passes;
- `runtimeName`, `protocolVersion`, timestamps, and model count match the mounted environment;
- no endpoint or credential value appears in the report.

Preserve the returned report with:

- candidate commit SHA;
- macOS version and hardware class;
- runtime/donor version or commit;
- exact sanitized report output.

A passing report becomes `VERIFIED-RUNTIME` only when the surrounding evidence proves it ran against the mounted macOS Code Fusion + real Nativ runtime path.

## Required negative checks

The first runtime certification must also prove:

1. non-loopback native intelligence origins are rejected;
2. base URLs with embedded credentials, query strings, fragments, or non-root paths are rejected;
3. malformed `/v1/models` JSON does not become a success;
4. non-2xx readiness/inventory responses do not become a success;
5. timeout produces a truthful unavailable/failure state;
6. renderer-visible errors redact Bearer/token/API-key/Authorization-like values;
7. there is still no renderer model load/unload/download/delete or shell/process-control API.

## Promotion gate

The first Models / Runtime UI may move from `GATED` to implementation review only after:

- Gate A is `VERIFIED-AUTOMATED` + `VERIFIED-BUILD`;
- Gates B-F are `VERIFIED-RUNTIME`;
- secrets remain host-side;
- PR review confirms the renderer boundary is still read-only;
- any defects discovered during mounted testing have regression coverage.

Model lifecycle mutations remain a separate later security milestone even after the read-only UI gate opens.
