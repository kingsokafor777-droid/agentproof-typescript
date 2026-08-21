# Contributing

Contributions must preserve the local, deterministic, privacy-minimized contract. Do not add model
calls, tool selection or execution logic, dynamic downloads, network fetches, collector/exporter
configuration, remote baseline retrieval, secrets, payload capture, arbitrary event attributes, or
vendor framework dependencies to the default package.

Run `pnpm validate` before proposing a change. Any change to Core JSON, canonicalization, OTLP
output, lifecycle behavior, or privacy exclusions requires fixtures, compatibility documentation,
and a semantic-versioning review.
