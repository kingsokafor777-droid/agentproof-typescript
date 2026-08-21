import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  fingerprintWorkflowTrace,
  RecorderStateError,
  TraceRecorder,
  TraceValidationError,
  validateWorkflowTrace,
} from "../src/index.js";
import { safeObservation, traceWithParent } from "./helpers.js";

test("recorder assigns contiguous sequence, seals idempotently, and deeply freezes Core evidence", () => {
  const recorder = new TraceRecorder({
    traceId: "checkout-review",
    source: "storefront",
    recordedAt: "2026-08-21T00:00:00Z",
    metadata: { environment: "test" },
  });
  const appended = recorder.record(safeObservation());
  assert.equal(appended.sequence, 1);
  assert.deepEqual(appended.attributes, {
    sdk: { adapter: "agentproof-typescript", adapter_version: "0.1" },
  });
  const trace = recorder.seal();
  assert.equal(trace.events.length, 1);
  assert.equal(trace.recorded_at, "2026-08-21T00:00:00Z");
  assert.deepEqual(trace.metadata, {
    environment: "test",
    sdk: { adapter: "agentproof-typescript", adapter_version: "0.1" },
  });
  assert.equal(Object.isFrozen(trace), true);
  assert.equal(Object.isFrozen(trace.events), true);
  assert.strictEqual(recorder.seal(), trace);
  assert.match(fingerprintWorkflowTrace(trace), /^[a-f0-9]{64}$/);
  assert.throws(() => recorder.record(safeObservation({ eventId: "another" })), RecorderStateError);
});

test("recorder fails closed on empty traces, duplicate IDs, unknown parents, and reserved metadata", () => {
  const empty = new TraceRecorder({
    traceId: "empty",
    source: "storefront",
    recordedAt: "2026-08-21T00:00:00Z",
  });
  assert.throws(() => empty.seal(), RecorderStateError);

  const recorder = new TraceRecorder({
    traceId: "ordered",
    source: "storefront",
    recordedAt: "2026-08-21T00:00:00Z",
  });
  recorder.record(safeObservation());
  assert.throws(() => recorder.record(safeObservation()), RecorderStateError);
  assert.throws(
    () =>
      recorder.record(
        safeObservation({
          eventId: "child",
          parentEventId: "missing",
          timestamp: "2026-08-21T00:00:02Z",
        }),
      ),
    RecorderStateError,
  );
  assert.throws(
    () =>
      new TraceRecorder({
        traceId: "reserved",
        source: "storefront",
        recordedAt: "2026-08-21T00:00:00Z",
        metadata: { sdk: "untrusted" },
      }),
    TraceValidationError,
  );
});

test("strict Core validator accepts sealed fixture and rejects unknown fields, numeric identity values, and broken event relationships", () => {
  const fixture: Record<string, unknown> = JSON.parse(
    readFileSync(new URL("../fixtures/safe-typescript.trace.json", import.meta.url), "utf8"),
  );
  const trace = validateWorkflowTrace(fixture);
  assert.equal(trace.schema_version, "1.0");
  assert.equal(trace.events[0]?.tool.name, "get_stock");

  assert.throws(
    () => validateWorkflowTrace({ ...fixture, unexpected: true }),
    TraceValidationError,
  );
  assert.throws(
    () => validateWorkflowTrace({ ...fixture, metadata: { attempt: 1 } }),
    TraceValidationError,
  );
  const parentTrace = traceWithParent();
  const brokenParent = {
    ...parentTrace,
    events: parentTrace.events.map((event) => ({ ...event })),
  };
  brokenParent.events[1] = { ...brokenParent.events[1]!, parent_event_id: "not-seen" };
  assert.throws(() => validateWorkflowTrace(brokenParent), TraceValidationError);
  const sequenceTrace = traceWithParent();
  const brokenSequence = {
    ...sequenceTrace,
    events: sequenceTrace.events.map((event) => ({ ...event })),
  };
  brokenSequence.events[1] = { ...brokenSequence.events[1]!, sequence: 4 };
  assert.throws(() => validateWorkflowTrace(brokenSequence), TraceValidationError);
});

test("approval validation maintains terminal evidence requirements", () => {
  const base = traceWithParent();
  const invalidApproved = { ...base, events: base.events.map((event) => ({ ...event })) };
  invalidApproved.events[0] = {
    ...invalidApproved.events[0]!,
    approval: { state: "approved", approval_id: "approval-1" },
  };
  assert.throws(() => validateWorkflowTrace(invalidApproved), TraceValidationError);

  const validApproved = { ...base, events: base.events.map((event) => ({ ...event })) };
  validApproved.events[0] = {
    ...validApproved.events[0]!,
    approval: {
      state: "approved",
      approval_id: "approval-1",
      approved_by: { actor_id: "reviewer-1", kind: "human" },
    },
  };
  assert.equal(validateWorkflowTrace(validApproved).events[0]?.approval.state, "approved");
});

test("strict validator rejects malformed nested Core contract fields and accepts defaultable optional fields", () => {
  const base = traceWithParent();
  const first = base.events[0]!;
  const second = base.events[1]!;
  const withoutApproval = (({ approval: _approval, ...event }) => event)(first);
  const withoutOptionalFields = {
    ...base,
    events: [
      {
        ...withoutApproval,
        actor: { actor_id: "order-agent", kind: "agent" },
        tool: { server_id: "inventory", name: "get_stock" },
        requested_capabilities: [],
        input_labels: [],
        output_labels: [],
        attributes: {},
      },
      second,
    ],
    metadata: {},
  };
  assert.equal(
    validateWorkflowTrace(withoutOptionalFields).events[0]?.approval.state,
    "not_required",
  );

  const invalidCases: readonly unknown[] = [
    null,
    [],
    new Date("2026-08-21T00:00:00Z"),
    { ...base, schema_version: "2.0" },
    { ...base, schema_version: null },
    { ...base, trace_id: "has spaces" },
    { ...base, source: "" },
    { ...base, events: [] },
    { ...base, events: [{ ...first, sequence: 0 }, second] },
    { ...base, events: [{ ...first, sequence: 1.5 }, second] },
    { ...base, events: [{ ...first, parent_event_id: "inventory-read" }, second] },
    {
      ...base,
      events: [
        { ...first, event_id: "inventory-read" },
        { ...second, event_id: "inventory-read", parent_event_id: "inventory-read" },
      ],
    },
    { ...base, events: [{ ...first, actor: { actor_id: "order-agent", kind: "vendor" } }, second] },
    {
      ...base,
      events: [
        { ...first, tool: { server_id: "inventory", name: "get_stock", extra: true } },
        second,
      ],
    },
    { ...base, events: [{ ...first, outcome: "maybe" }, second] },
    { ...base, events: [{ ...first, side_effect: "delete" }, second] },
    {
      ...base,
      events: [{ ...first, requested_capabilities: ["inventory.read", "inventory.read"] }, second],
    },
    { ...base, events: [{ ...first, input_labels: ["secret"] }, second] },
    { ...base, events: [{ ...first, input_labels: "internal" }, second] },
    { ...base, events: [{ ...first, attributes: { count: 1 } }, second] },
    { ...base, events: [{ ...first, attributes: null }, second] },
    { ...base, events: [{ ...first, requested_capabilities: null }, second] },
    { ...base, events: [{ ...first, parent_event_id: 1 }, second] },
    { ...base, events: [{ ...first, approval: { state: "denied" } }, second] },
    { ...base, events: [{ ...first, approval: { state: "maybe" } }, second] },
    {
      ...base,
      events: [{ ...first, approval: { state: "not_required", approval_id: "review-1" } }, second],
    },
    { ...base, metadata: null },
  ];
  for (const invalid of invalidCases) {
    assert.throws(() => validateWorkflowTrace(invalid), TraceValidationError);
  }

  const observationRecorder = new TraceRecorder({
    traceId: "bounded-observation",
    source: "storefront",
    recordedAt: "2026-08-21T00:00:00Z",
  });
  assert.throws(
    () =>
      observationRecorder.record(
        safeObservation({ actor: { actorId: "a", kind: "agent", displayName: "x".repeat(129) } }),
      ),
    TraceValidationError,
  );
  assert.throws(
    () =>
      observationRecorder.record(
        safeObservation({
          tool: { serverId: "inventory", name: "get_stock", version: "x".repeat(65) },
        }),
      ),
    TraceValidationError,
  );
  observationRecorder.record({
    eventId: "minimal-read",
    timestamp: "2026-08-21T00:00:01Z",
    actor: { actorId: "order-agent", kind: "agent" },
    tool: { serverId: "inventory", name: "get_stock" },
    sideEffect: "read",
  });
  assert.equal(observationRecorder.seal().events[0]?.requested_capabilities.length, 0);

  const approvalRecorder = new TraceRecorder({
    traceId: "approved-observation",
    source: "storefront",
    recordedAt: "2026-08-21T00:00:00Z",
  });
  approvalRecorder.record(
    safeObservation({
      approval: {
        state: "approved",
        approvalId: "approval-1",
        approvedBy: { actorId: "reviewer-1", kind: "human" },
      },
    }),
  );
  assert.equal(approvalRecorder.seal().events[0]?.approval.approved_by?.actor_id, "reviewer-1");
  const rejectedApproval = new TraceRecorder({
    traceId: "rejected-observation",
    source: "storefront",
    recordedAt: "2026-08-21T00:00:00Z",
  });
  assert.throws(
    () =>
      rejectedApproval.record(
        safeObservation({ approval: { state: "not_required", approvalId: "review-1" } }),
      ),
    TraceValidationError,
  );
  assert.throws(
    () => rejectedApproval.record(safeObservation({ approval: { state: "denied" } })),
    TraceValidationError,
  );
  assert.throws(
    () =>
      rejectedApproval.record(
        safeObservation({ approval: { state: "approved", approvalId: "approval-1" } }),
      ),
    TraceValidationError,
  );
  assert.throws(
    () => rejectedApproval.record(safeObservation({ approval: { state: "unsupported" as never } })),
    TraceValidationError,
  );
});
