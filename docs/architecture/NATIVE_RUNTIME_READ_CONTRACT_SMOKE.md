# Nativ Read-Contract Smoke

Status: **READY TO RUN / SOURCE-VERIFIED; live Mac runtime not tested**

This standalone read-only smoke verifies the current Nativ-compatible public runtime surface before Code Fusion opens the visible Model Hub gate.

## Run

Start the audited Nativ runtime, then run from Code-Fusion-A:

```bash
node scripts/code-fusion/verify-nativ-read-contract.mjs
```

Optional arguments:

```bash
node scripts/code-fusion/verify-nativ-read-contract.mjs \
  --base-url http://127.0.0.1:8080/ \
  --timeout-ms 5000 \
  --api-key-env NATIV_API_KEY
```

The API key is read from the named environment variable and is never written to the report.

## Read-only checks

The script performs only these GET requests:

1. `/v1/models`
2. `/health`
3. `/metrics`

It does not call model load/unload/download/delete/pin/cache mutation or server lifecycle routes.

## Safety properties

- accepts only a clean loopback HTTP(S) origin;
- optional Bearer token is carried in a header, not the URL;
- complete response bodies are consumed or cancelled;
- each response is limited to 1 MiB;
- model inventory is limited to 4,096 entries;
- identifiers are trimmed, bounded to 512 characters, and deduplicated for the count;
- output includes endpoint status, duration, runtime origin, model count, and timestamps but no API key;
- endpoint failures are recorded independently;
- error details are length-bounded and redact Bearer, token, API-key, and authorization values;
- nonzero exit status indicates any failed check.

## Evidence classification

A passing output proves only the standalone read contract for the runtime instance tested. Preserve:

- Code-Fusion-A commit;
- Code-Fusion-B/Nativ commit;
- macOS and hardware;
- script JSON output;
- server log excerpt;
- whether authentication was enabled.

Classify a passing run as `VERIFIED-RUNTIME-FOCUSED`. It does not replace:

- Code Fusion Electron build/typecheck/tests;
- mounted `window.api.nativeIntelligence` verification;
- packaged application verification;
- management-authentication negative tests;
- MLX inference and model lifecycle certification.

## Required sequence

1. Run against frozen Code-Fusion-B `main`.
2. Run against `codefusion/upstream-audit-2026-09-03`.
3. Compare results.
4. Run the mounted Code Fusion `runReadCertification()` path against the audited runtime.
5. Keep all model-management operations gated until their separate permission and recovery design is approved.
