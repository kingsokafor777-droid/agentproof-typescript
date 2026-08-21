import assert from "node:assert/strict";
import test from "node:test";

import { toOtlpJson, validateWorkflowTrace } from "../src/index.js";
import { traceWithParent } from "./helpers.js";

test("OTLP bridge is deterministic, preserves only an allowlisted mapping, and retains selected parent edges", () => {
  const trace = validateWorkflowTrace(traceWithParent());
  const exported = toOtlpJson(trace);
  const repeated = toOtlpJson(trace);
  assert.deepEqual(repeated, exported);
  const resource = exported.resourceSpans[0]?.resource;
  const scope = exported.resourceSpans[0]?.scopeSpans[0];
  const first = scope?.spans[0];
  const second = scope?.spans[1];
  assert.equal(resource?.attributes[0]?.key, "service.name");
  assert.equal(scope?.scope.name, "agentproof.typescript");
  assert.equal(first?.traceId, "15a3a317b10359221b3e2400dc737635");
  assert.equal(first?.spanId, "72068a2b2d4029e6");
  assert.equal(second?.parentSpanId, first?.spanId);
  assert.equal(second?.status.code, 2);
  assert.equal(first?.startTimeUnixNano, "1787270401000000000");
  assert.equal(second?.startTimeUnixNano, "1787270402000001000");
  const serialized = JSON.stringify(exported);
  assert.doesNotMatch(serialized, /Order agent|1\.2|approval|metadata|prompt|error text/i);
  assert.match(serialized, /agentproof\.requested_capabilities/);
});
