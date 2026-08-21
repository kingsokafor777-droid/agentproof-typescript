import assert from "node:assert/strict";
import test from "node:test";

import {
  captureAsync,
  captureSync,
  NodeToolLifecycle,
  RecorderStateError,
  TraceRecorder,
} from "../src/index.js";
import { safeObservation } from "./helpers.js";

function recorder(traceId: string): TraceRecorder {
  return new TraceRecorder({ traceId, source: "storefront", recordedAt: "2026-08-21T00:00:00Z" });
}

test("sync and async helpers record only terminal outcome while preserving caller results and errors", async () => {
  const successRecorder = recorder("sync-success");
  const result = captureSync(successRecorder, safeObservation(), () => "caller-result");
  assert.equal(result, "caller-result");
  assert.equal(successRecorder.seal().events[0]?.outcome, "succeeded");

  const failureRecorder = recorder("sync-failure");
  const error = new Error("callers keep their own error object");
  assert.throws(
    () =>
      captureSync(failureRecorder, safeObservation(), () => {
        throw error;
      }),
    (caught: unknown) => caught === error,
  );
  assert.equal(failureRecorder.seal().events[0]?.outcome, "failed");

  const asyncRecorder = recorder("async-failure");
  await assert.rejects(
    captureAsync(asyncRecorder, safeObservation(), async () => Promise.reject(error)),
    (caught: unknown) => caught === error,
  );
  assert.equal(asyncRecorder.seal().events[0]?.outcome, "failed");

  const asyncSuccessRecorder = recorder("async-success");
  assert.equal(
    await captureAsync(asyncSuccessRecorder, safeObservation(), async () => "async-caller-result"),
    "async-caller-result",
  );
  assert.equal(asyncSuccessRecorder.seal().events[0]?.outcome, "succeeded");
});

test("generic Node lifecycle correlates explicit IDs without accepting callback payloads", () => {
  const traceRecorder = recorder("lifecycle");
  const lifecycle = new NodeToolLifecycle(traceRecorder);
  lifecycle.begin("run-1", safeObservation());
  assert.equal(lifecycle.activeRunCount, 1);
  assert.throws(() => lifecycle.begin("run-1", safeObservation()), RecorderStateError);
  lifecycle.succeed("run-1");
  assert.equal(lifecycle.activeRunCount, 0);
  assert.equal(traceRecorder.seal().events[0]?.outcome, "succeeded");
  assert.throws(() => lifecycle.fail("run-1"), RecorderStateError);

  const failureRecorder = recorder("lifecycle-fail");
  const failingLifecycle = new NodeToolLifecycle(failureRecorder);
  failingLifecycle.begin("run-2", safeObservation());
  failingLifecycle.fail("run-2");
  assert.equal(failureRecorder.seal().events[0]?.outcome, "failed");
  assert.throws(() => failingLifecycle.begin("run-3", safeObservation()), RecorderStateError);

  const sealedRecorder = recorder("sealed-lifecycle");
  sealedRecorder.record(safeObservation());
  sealedRecorder.seal();
  assert.throws(
    () => new NodeToolLifecycle(sealedRecorder).begin("run-4", safeObservation()),
    RecorderStateError,
  );
});
