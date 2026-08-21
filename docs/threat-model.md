# Threat model

## Protected assets

The SDK protects the integrity and minimization of event identifiers, parent edges, sequence order,
typed side effects, approvals, data labels, capability labels, fixed provenance, deterministic
fingerprints, and bounded OTLP output. It does not protect a host from a malicious process, prove
that a recorded event occurred, authenticate evidence producers, or make an agent safe.

| Threat                                     | Control                                                                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Payload disclosure through instrumentation | Observation and lifecycle APIs lack payload-bearing parameters; bridge emits an explicit allowlist only.            |
| Post-seal or caller mutation               | Input metadata is cloned and validated; sealed output is deeply frozen; later writes fail closed.                   |
| Event reordering or parent forgery         | Sequences are assigned internally and parents must already be recorded.                                             |
| Callback/run correlation confusion         | Lifecycle state is explicit; duplicate starts and unknown or duplicate terminal states fail closed.                 |
| Cross-language identity drift              | Canonical JSON is key-sorted and compact; numerically ambiguous values and non-JSON JavaScript values are rejected. |
| OTel transport side effect                 | The package produces a local object only and owns no provider, exporter, endpoint, or collector configuration.      |
| Framework semantic overclaim               | Generic lifecycle helpers accept explicit templates only and make no authorization, safety, or policy decision.     |

Callers must provide non-secret stable metadata, keep runtime permissions least-privileged, and
secure any transport they configure outside this package.
