import {
  RecorderStateError,
  validateIdentifier,
  validateObservation,
  withOutcome,
} from "./trace.js";
import type { TraceRecorder } from "./trace.js";
import type { ToolObservation } from "./types.js";

export function captureSync<T>(
  recorder: TraceRecorder,
  observation: ToolObservation,
  work: () => T,
): T {
  let result: T;
  try {
    result = work();
  } catch (error) {
    recorder.record(withOutcome(observation, "failed"));
    throw error;
  }
  recorder.record(withOutcome(observation, "succeeded"));
  return result;
}

export async function captureAsync<T>(
  recorder: TraceRecorder,
  observation: ToolObservation,
  work: () => Promise<T>,
): Promise<T> {
  let result: T;
  try {
    result = await work();
  } catch (error) {
    recorder.record(withOutcome(observation, "failed"));
    throw error;
  }
  recorder.record(withOutcome(observation, "succeeded"));
  return result;
}

export class NodeToolLifecycle {
  readonly #recorder: TraceRecorder;
  readonly #active = new Map<string, ToolObservation>();

  public constructor(recorder: TraceRecorder) {
    this.#recorder = recorder;
  }

  public get activeRunCount(): number {
    return this.#active.size;
  }

  public begin(runId: string, observation: ToolObservation): void {
    const normalizedRunId = validateIdentifier(runId, "runId");
    if (this.#recorder.isSealed) {
      throw new RecorderStateError("A sealed recorder cannot accept an active lifecycle run.");
    }
    if (this.#active.has(normalizedRunId)) {
      throw new RecorderStateError(`Run ${normalizedRunId} is already active.`);
    }
    validateObservation(observation);
    this.#active.set(normalizedRunId, withOutcome(observation, observation.outcome ?? "succeeded"));
  }

  public succeed(runId: string): void {
    this.#complete(runId, "succeeded");
  }

  public fail(runId: string): void {
    this.#complete(runId, "failed");
  }

  #complete(runId: string, outcome: "succeeded" | "failed"): void {
    const normalizedRunId = validateIdentifier(runId, "runId");
    const observation = this.#active.get(normalizedRunId);
    if (observation === undefined) {
      throw new RecorderStateError(`Run ${normalizedRunId} has no active observation template.`);
    }
    this.#active.delete(normalizedRunId);
    this.#recorder.record(withOutcome(observation, outcome));
  }
}
