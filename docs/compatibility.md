# Compatibility policy

## Supported surface

| Component       | v0.1 compatibility                                             |
| --------------- | -------------------------------------------------------------- |
| Node.js         | 20.x, 22.x, and 24.x                                           |
| TypeScript      | 5.7 or later for consumer type checking                        |
| AgentProof Core | `WorkflowTrace` schema `1.0` JSON contract                     |
| AgentProof OTel | `0.1.x` normalization of the documented local OTLP JSON subset |
| Module format   | ESM package entrypoint with TypeScript declarations            |

The package has no runtime npm dependencies. AgentProof Core is a schema contract rather than a
Node runtime dependency, and OTel normalization remains an optional downstream handoff owned by the
published Python package.

## Semantic versioning

Additive optional APIs and non-identity-bearing diagnostics are minor changes. Changes to emitted
Core JSON fields, default provenance, canonicalization, timestamp precision, lifecycle terminal
semantics, OTLP allowlisted keys, ID derivation, privacy exclusions, or validation behavior are
breaking and require a major version. Security fixes may reject formerly accepted unsafe values in a
patch release when accepting them would violate the documented boundary.

## Upgrade rules

Consumers should pin a reviewed package version or immutable source commit in security-sensitive CI.
Cross-repository compatibility changes must update this document, Core fixtures, and the OTel
contract test in the same reviewed release.
