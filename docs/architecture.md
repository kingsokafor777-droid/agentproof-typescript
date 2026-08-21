# Architecture boundary

## Purpose and non-goals

`agentproof-typescript` is a **local typed evidence-capture SDK** for Node.js. It converts explicit
tool observation templates into strict AgentProof Core `WorkflowTrace` v1.0 JSON, offers bounded
lifecycle helpers for caller-owned Node operations, and creates an in-memory OTLP JSON envelope for
the published `agentproof-otel` normalizer. It does not instantiate a tracer provider, configure an
exporter, start a collector, call an LLM, execute a tool by itself, make a network request, or
evaluate a policy.

The package intentionally owns no framework adapter in v0.1. `NodeToolLifecycle` is a generic
run-ID correlator, not an adapter for a vendor runtime. Framework integrations can translate their
own lifecycle events into its explicit template/terminal methods without transferring payloads.

## Public surface

| API                            | Responsibility                                                   | Security-relevant behavior                                                                                             |
| ------------------------------ | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `TraceRecorder`                | Owns one ordered trace under construction.                       | Rejects duplicate IDs, forward parents, empty seals, post-seal mutation, and caller-controlled sequence numbers.       |
| `ToolObservation`              | Typed event input.                                               | Has no field for prompts, args, results, exception text, headers, credentials, or arbitrary attributes.                |
| `captureSync` / `captureAsync` | Observe caller-owned synchronous or asynchronous work.           | Reads only completion versus thrown/rejected state; rethrows the original failure untouched.                           |
| `NodeToolLifecycle`            | Correlates an explicit opaque run ID to an observation template. | Rejects duplicate starts and unseen/duplicate terminals; terminal methods never accept payloads.                       |
| `validateWorkflowTrace`        | Applies the Core v1.0 shape and relationship invariants.         | Rejects unknown fields, invalid IDs/timestamps, malformed approvals, invalid JSON values, and unsafe numeric metadata. |
| `toOtlpJson`                   | Produces a deterministic local interchange envelope.             | Emits only an allowlisted mapping and cannot transport data.                                                           |

## Evidence lifecycle

```text
open -> typed observation appended* -> sealed
              |                         |
              +-> invalid evidence       +-> all writes fail closed
```

The recorder is constructed with a caller-owned trace ID, source, UTC timestamp, and optional
small metadata object. It assigns contiguous sequences internally. Each event can reference only
an event already recorded in the same trace. `seal()` validates and deeply freezes the exact
Core-compatible JSON payload; it is idempotent, but no later write is accepted.

The SDK uses an allowlisted provenance shape:

```json
{
  "sdk": { "adapter": "agentproof-typescript", "adapter_version": "0.1" }
}
```

Callers may not replace this reserved `sdk` key through event attributes because observations do
not accept attributes and metadata with an `sdk` key is rejected.

## Canonical identity

AgentProof Core fingerprints a UTF-8 SHA-256 digest of canonical JSON: recursively sorted object
keys, compact separators, and unescaped Unicode. The TypeScript SDK implements the same constrained
form for JSON values that have an unambiguous cross-language representation: `null`, booleans,
strings, arrays, plain objects, and safe integers. It rejects fractional numbers, `undefined`,
non-finite values, functions, symbols, bigint values, non-plain objects, and malformed Unicode
surrogate sequences at the identity-bearing metadata/attribute boundary.

This is intentionally a strict subset of generic JSON. JavaScript cannot preserve distinctions such
as `1` versus `1.0`, which can alter a Python JSON serialization. The SDK therefore allows only
the protocol’s safe integral structural values, including event sequence numbers, and refuses
user-controlled numeric metadata and attributes instead of silently making the fingerprint
guarantee conditional.

## Node lifecycle boundary

`captureSync` and `captureAsync` receive a zero-argument caller-owned closure. They invoke that
closure only because the host application chose to wrap it; the SDK does not select a tool, derive
inputs, inspect return values, intercept arguments, serialize errors, retry work, or infer
authorization. A successful completion records `succeeded`; a thrown or rejected completion records
`failed` and rethrows unchanged.

`NodeToolLifecycle` records an event only at an explicit terminal call. `begin(runId, observation)`
stores a validated, payload-free template. `succeed(runId)` and `fail(runId)` have no value
arguments and append the matching typed outcome exactly once. This gives JavaScript framework
adapters a safe correlation point without making the SDK framework-aware.

## OTLP bridge

`toOtlpJson(trace)` emits the narrow JSON surface accepted by `agentproof-otel`:

| OTLP location       | Value                                                                     |
| ------------------- | ------------------------------------------------------------------------- |
| Resource attributes | Core source as `service.name`; fixed SDK name and version.                |
| Scope               | `agentproof.typescript`, version `0.1`.                                   |
| Trace and span IDs  | SHA-256-derived lower-case 32/16 hexadecimal values from stable Core IDs. |
| Span name           | Typed tool name only.                                                     |
| Allowed attributes  | Tool name, actor ID/kind, side effect, capabilities, and labels.          |
| Status              | `ERROR` only for `failed`; `UNSET` for all other typed outcomes.          |

The bridge omits approvals, display names, tool versions, metadata, arbitrary event attributes,
prompts, arguments, outputs, exception text, and sensitive values. `agentproof-otel` remains the
sole owner of OTLP decoding and OTLP-to-Core normalization. The bridge returns a JavaScript object;
no provider, exporter, HTTP client, or collector endpoint is present.

## Release acceptance criteria

The repository cannot be marked shipped without sealed deterministic fixtures; strict Core and OTel
contract checks; post-seal, parent-order, lifecycle-correlation, privacy, and error-path tests;
strict TypeScript; linting and formatting; at least 95% branch coverage; package/SBOM inspection;
immutable-pinned least-privilege CI and CodeQL; and no credentials, model, tool, collector, or
network activity in the test suite.
