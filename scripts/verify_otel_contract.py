"""Verify the local TypeScript OTLP bridge against published AgentProof Core and OTel contracts."""

from __future__ import annotations

import json
import sys
from pathlib import Path

from agentproof_otel import normalize_otlp


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: verify_otel_contract.py <local-otlp-json>")
    payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    result = normalize_otlp(payload)
    if len(result.traces) != 1:
        raise SystemExit("Expected one AgentProof trace after OTel normalization.")
    trace = result.traces[0]
    if trace.source != "agentproof.otel" or len(trace.events) != 1:
        raise SystemExit("OTel normalization did not produce the expected Core trace shape.")
    event = trace.events[0]
    if event.tool.name != "get_stock" or event.side_effect.value != "read":
        raise SystemExit("OTel normalization did not preserve typed tool metadata.")
    if event.actor.actor_id != "order-agent" or event.outcome.value != "succeeded":
        raise SystemExit("OTel normalization did not preserve actor or outcome semantics.")
    print(f"VALID trace_id={trace.trace_id} fingerprint={trace.fingerprint()}")


if __name__ == "__main__":
    main()
