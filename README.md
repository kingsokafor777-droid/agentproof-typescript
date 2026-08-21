# AgentProof TypeScript

**AgentProof TypeScript** is a local, typed TypeScript and Node.js SDK for creating deterministic
AgentProof Core `WorkflowTrace` evidence from explicit, payload-free tool observations. It provides
an append-only recorder, bounded synchronous and asynchronous lifecycle helpers, a small Node
lifecycle correlator, canonical JSON fingerprints, and a deterministic in-memory OTLP JSON bridge.

The package is framework-neutral. It does not run an agent, choose or authorize a tool, call a
model, evaluate policy, configure an OpenTelemetry provider/exporter/collector, make a network
request, or capture prompts, arguments, results, exception text, headers, credentials, or arbitrary
attributes.

## Why this exists

AgentProof treats a tool-using workflow as security-relevant evidence: ordered actions, actor
identity, typed side effects, data labels, requested capabilities, and approval state must remain
available for deterministic replay and policy evaluation. This package gives Node applications a
small boundary for producing that evidence without turning instrumentation into a data-collection
path.

| Capability                     | Boundary                                                                                                                      |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `TraceRecorder`                | Appends typed observations and seals one immutable Core-compatible trace.                                                     |
| `captureSync` / `captureAsync` | Records only terminal outcome around a caller-owned operation; arguments, return values, and errors are never read.           |
| `NodeToolLifecycle`            | Correlates explicitly supplied run IDs with predeclared observation templates; it accepts no payload-bearing callback values. |
| `validateWorkflowTrace`        | Strictly validates the v1.0 Core trace shape and canonicalizes timestamps.                                                    |
| `fingerprintWorkflowTrace`     | Computes a SHA-256 fingerprint over deterministic canonical JSON.                                                             |
| `toOtlpJson`                   | Builds a local OTLP JSON envelope consumable by the published AgentProof OTel normalizer.                                     |

## Quick start

```ts
import { TraceRecorder, type ToolObservation, toOtlpJson } from "agentproof-typescript";

const recorder = new TraceRecorder({
  traceId: "checkout-review",
  source: "storefront",
  recordedAt: "2026-08-21T00:00:00Z",
});

const observation: ToolObservation = {
  eventId: "inventory-read",
  timestamp: "2026-08-21T00:00:01Z",
  actor: { actorId: "order-agent", kind: "agent" },
  tool: { serverId: "inventory", name: "get_stock" },
  sideEffect: "read",
  requestedCapabilities: ["inventory.read"],
  inputLabels: ["internal"],
  outputLabels: ["internal"],
};

recorder.record(observation);
const trace = recorder.seal();
const otlp = toOtlpJson(trace); // Local JSON only; no transport occurs.
```

## Installation

The initial public release supports Node.js 20, 22, and 24. Package publication is intentionally
separate from source release; use a full Git commit pin for pre-package evaluation:

```sh
npm install github:kingsokafor777-droid/agentproof-typescript#<reviewed-commit>
```

## Security and privacy boundary

Observations intentionally contain only typed metadata. The SDK neither accepts nor derives
prompt text, tool arguments, tool output, arbitrary callback context, error text, serialized
framework objects, authentication material, or network endpoints. Callers must use stable,
non-secret identifiers and must not place sensitive information in names, metadata, labels, or
capabilities.

Numeric metadata and arbitrary attributes are rejected in v0.1. This deliberate narrowness avoids
cross-language JSON-number ambiguity in user-controlled identity-bearing fields. The protocol’s
required integral event sequence remains supported and is serialized deterministically. Encode a
bounded non-secret value as a string when it is required for evidence.

## Development

```sh
pnpm install --frozen-lockfile
pnpm validate
```

`pnpm validate` runs Prettier, ESLint, strict TypeScript checking, deterministic offline tests with
branch coverage gates, production build, package tarball inspection, and an SBOM generation check.
The cross-language OTel contract test is run in CI with immutable AgentProof Core and OTel source
pins; it does not contact an OTel endpoint.

The CI release-evidence artifact contains the compiled package, inspected npm tarball, and a
deterministic CycloneDX runtime SBOM. v0.1 has **zero production npm dependencies**, and the
repository-owned SBOM generator asserts that fact before emitting a first-party-only runtime graph.
Source publication and package publication are deliberately distinct operations: a reviewed source
release must pass these reproducible checks before a package registry or provenance attestation
workflow is authorized.

## Compatibility and scope

The v0.1 SDK emits AgentProof Core `WorkflowTrace` schema `1.0` JSON and a narrow OTLP JSON subset
accepted by AgentProof OTel `0.1.x`. See [the architecture boundary](docs/architecture.md),
[compatibility policy](docs/compatibility.md), and [threat model](docs/threat-model.md).

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md) before proposing changes. Report vulnerabilities through a
GitHub private security advisory; do not include secrets, production traces, or customer data in a
report. The detailed security boundary is in [SECURITY.md](SECURITY.md).

## License

Apache-2.0. See [LICENSE](LICENSE).
