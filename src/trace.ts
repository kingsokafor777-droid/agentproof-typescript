import {
  cloneJsonObject,
  deepFreeze,
  normalizeUtcTimestamp,
  sha256Hex,
  TraceValidationError,
} from "./canonical.js";
import {
  IDENTIFIER_PATTERN,
  SCHEMA_VERSION,
  type ActorKind,
  type ActorRef,
  type Approval,
  type ApprovalState,
  type DataClassification,
  type EventOutcome,
  type JsonObject,
  type ObservationActor,
  type ObservationApproval,
  type ObservationTool,
  type SideEffect,
  type ToolCall,
  type ToolObservation,
  type ToolRef,
  type TraceRecorderOptions,
  type WorkflowTrace,
} from "./types.js";

const ACTOR_KINDS = new Set<ActorKind>(["agent", "human", "service", "system"]);
const OUTCOMES = new Set<EventOutcome>(["succeeded", "failed", "blocked", "cancelled", "unknown"]);
const SIDE_EFFECTS = new Set<SideEffect>(["none", "read", "write", "irreversible"]);
const APPROVAL_STATES = new Set<ApprovalState>([
  "not_required",
  "pending",
  "approved",
  "denied",
  "expired",
]);
const LABELS = new Set<DataClassification>(["public", "internal", "confidential", "restricted"]);
const SDK_PROVENANCE: JsonObject = {
  sdk: { adapter: "agentproof-typescript", adapter_version: "0.1" },
};

export class RecorderStateError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "RecorderStateError";
  }
}

function expectRecord(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TraceValidationError(`${path} must be an object.`);
  }
  const prototype = Object.getPrototypeOf(value) as object | null;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TraceValidationError(`${path} must be a plain object.`);
  }
  return value as Record<string, unknown>;
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
): void {
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new TraceValidationError(`${path} contains unknown field ${key}.`);
    }
  }
}

function requiredString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TraceValidationError(`${path} must be a non-empty string.`);
  }
  return value;
}

export function validateIdentifier(value: unknown, path: string): string {
  const identifier = requiredString(value, path);
  if (!IDENTIFIER_PATTERN.test(identifier)) {
    throw new TraceValidationError(`${path} must be a stable non-secret identifier.`);
  }
  return identifier;
}

function optionalBoundedString(value: unknown, path: string, maximum: number): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const stringValue = requiredString(value, path);
  if (stringValue.length > maximum) {
    throw new TraceValidationError(`${path} must be at most ${String(maximum)} characters.`);
  }
  return stringValue;
}

function validateActorKind(value: unknown, path: string): ActorKind {
  if (typeof value !== "string" || !ACTOR_KINDS.has(value as ActorKind)) {
    throw new TraceValidationError(`${path} is not a supported actor kind.`);
  }
  return value as ActorKind;
}

function validateOutcome(value: unknown, path: string): EventOutcome {
  if (typeof value !== "string" || !OUTCOMES.has(value as EventOutcome)) {
    throw new TraceValidationError(`${path} is not a supported event outcome.`);
  }
  return value as EventOutcome;
}

function validateSideEffect(value: unknown, path: string): SideEffect {
  if (typeof value !== "string" || !SIDE_EFFECTS.has(value as SideEffect)) {
    throw new TraceValidationError(`${path} is not a supported side effect.`);
  }
  return value as SideEffect;
}

function validateLabels(value: unknown, path: string): readonly DataClassification[] {
  if (!Array.isArray(value)) {
    throw new TraceValidationError(`${path} must be an array.`);
  }
  return value.map((entry, index) => {
    if (typeof entry !== "string" || !LABELS.has(entry as DataClassification)) {
      throw new TraceValidationError(`${path}[${String(index)}] is not a supported data label.`);
    }
    return entry as DataClassification;
  });
}

function validateCapabilities(value: unknown, path: string): readonly string[] {
  if (!Array.isArray(value)) {
    throw new TraceValidationError(`${path} must be an array.`);
  }
  const capabilities = value.map((entry, index) =>
    validateIdentifier(entry, `${path}[${String(index)}]`),
  );
  if (new Set(capabilities).size !== capabilities.length) {
    throw new TraceValidationError(`${path} may not contain duplicates.`);
  }
  return capabilities;
}

function actorFromObservation(value: ObservationActor, path: string): ActorRef {
  const actor: ActorRef = {
    actor_id: validateIdentifier(value.actorId, `${path}.actorId`),
    kind: validateActorKind(value.kind, `${path}.kind`),
  };
  const displayName = optionalBoundedString(value.displayName, `${path}.displayName`, 128);
  return displayName === undefined ? actor : { ...actor, display_name: displayName };
}

function toolFromObservation(value: ObservationTool, path: string): ToolRef {
  const tool: ToolRef = {
    server_id: validateIdentifier(value.serverId, `${path}.serverId`),
    name: validateIdentifier(value.name, `${path}.name`),
  };
  const version = optionalBoundedString(value.version, `${path}.version`, 64);
  return version === undefined ? tool : { ...tool, version };
}

function approvalFromObservation(value: ObservationApproval | undefined, path: string): Approval {
  const state = value === undefined ? "not_required" : (value.state ?? "not_required");
  if (!APPROVAL_STATES.has(state)) {
    throw new TraceValidationError(`${path}.state is not a supported approval state.`);
  }
  const approvalId = value?.approvalId;
  const approvedBy = value?.approvedBy;
  if (["approved", "denied", "expired"].includes(state) && approvalId === undefined) {
    throw new TraceValidationError(`${path}.approvalId is required for terminal approval state.`);
  }
  if (state === "approved" && approvedBy === undefined) {
    throw new TraceValidationError(`${path}.approvedBy is required for an approved state.`);
  }
  if (state === "not_required" && (approvalId !== undefined || approvedBy !== undefined)) {
    throw new TraceValidationError(
      `${path} may not include evidence when approval is not required.`,
    );
  }
  return {
    state,
    ...(approvalId === undefined
      ? {}
      : { approval_id: validateIdentifier(approvalId, `${path}.approvalId`) }),
    ...(approvedBy === undefined
      ? {}
      : { approved_by: actorFromObservation(approvedBy, `${path}.approvedBy`) }),
  };
}

function mergeSdkMetadata(metadata: JsonObject | undefined): JsonObject {
  const cloned = metadata === undefined ? {} : cloneJsonObject(metadata, "metadata", false);
  if ("sdk" in cloned) {
    throw new TraceValidationError("metadata.sdk is reserved for fixed SDK provenance.");
  }
  return { ...cloned, ...SDK_PROVENANCE };
}

function materializeObservation(observation: ToolObservation, sequence: number): ToolCall {
  const parentEventId =
    observation.parentEventId === undefined
      ? undefined
      : validateIdentifier(observation.parentEventId, "observation.parentEventId");
  const call: ToolCall = {
    event_id: validateIdentifier(observation.eventId, "observation.eventId"),
    sequence,
    timestamp: normalizeUtcTimestamp(observation.timestamp, "observation.timestamp"),
    actor: actorFromObservation(observation.actor, "observation.actor"),
    tool: toolFromObservation(observation.tool, "observation.tool"),
    outcome: validateOutcome(
      observation.outcome === undefined ? "succeeded" : observation.outcome,
      "observation.outcome",
    ),
    side_effect: validateSideEffect(observation.sideEffect, "observation.sideEffect"),
    approval: approvalFromObservation(observation.approval, "observation.approval"),
    requested_capabilities: validateCapabilities(
      observation.requestedCapabilities === undefined ? [] : observation.requestedCapabilities,
      "observation.requestedCapabilities",
    ),
    input_labels: validateLabels(
      observation.inputLabels === undefined ? [] : observation.inputLabels,
      "observation.inputLabels",
    ),
    output_labels: validateLabels(
      observation.outputLabels === undefined ? [] : observation.outputLabels,
      "observation.outputLabels",
    ),
    attributes: cloneJsonObject(SDK_PROVENANCE, "sdk provenance", false),
  };
  return parentEventId === undefined ? call : { ...call, parent_event_id: parentEventId };
}

function validateContractActor(value: unknown, path: string): ActorRef {
  const record = expectRecord(value, path);
  rejectUnknownKeys(record, ["actor_id", "kind", "display_name"], path);
  const actor: ActorRef = {
    actor_id: validateIdentifier(record.actor_id, `${path}.actor_id`),
    kind: validateActorKind(record.kind, `${path}.kind`),
  };
  const displayName = optionalBoundedString(record.display_name, `${path}.display_name`, 128);
  return displayName === undefined ? actor : { ...actor, display_name: displayName };
}

function validateContractTool(value: unknown, path: string): ToolRef {
  const record = expectRecord(value, path);
  rejectUnknownKeys(record, ["server_id", "name", "version"], path);
  const tool: ToolRef = {
    server_id: validateIdentifier(record.server_id, `${path}.server_id`),
    name: validateIdentifier(record.name, `${path}.name`),
  };
  const version = optionalBoundedString(record.version, `${path}.version`, 64);
  return version === undefined ? tool : { ...tool, version };
}

function validateContractApproval(value: unknown, path: string): Approval {
  const record = value === undefined ? {} : expectRecord(value, path);
  rejectUnknownKeys(record, ["state", "approval_id", "approved_by"], path);
  const stateValue = record.state === undefined ? "not_required" : record.state;
  if (typeof stateValue !== "string" || !APPROVAL_STATES.has(stateValue as ApprovalState)) {
    throw new TraceValidationError(`${path}.state is not a supported approval state.`);
  }
  const state = stateValue as ApprovalState;
  const approvalId = record.approval_id;
  const approvedBy = record.approved_by;
  if (["approved", "denied", "expired"].includes(state) && approvalId === undefined) {
    throw new TraceValidationError(`${path}.approval_id is required for terminal approval state.`);
  }
  if (state === "approved" && approvedBy === undefined) {
    throw new TraceValidationError(`${path}.approved_by is required for an approved state.`);
  }
  if (state === "not_required" && (approvalId !== undefined || approvedBy !== undefined)) {
    throw new TraceValidationError(
      `${path} may not include evidence when approval is not required.`,
    );
  }
  return {
    state,
    ...(approvalId === undefined || approvalId === null
      ? {}
      : { approval_id: validateIdentifier(approvalId, `${path}.approval_id`) }),
    ...(approvedBy === undefined || approvedBy === null
      ? {}
      : { approved_by: validateContractActor(approvedBy, `${path}.approved_by`) }),
  };
}

function validateContractToolCall(value: unknown, path: string): ToolCall {
  const record = expectRecord(value, path);
  rejectUnknownKeys(
    record,
    [
      "event_id",
      "sequence",
      "timestamp",
      "actor",
      "tool",
      "outcome",
      "side_effect",
      "parent_event_id",
      "approval",
      "requested_capabilities",
      "input_labels",
      "output_labels",
      "attributes",
    ],
    path,
  );
  if (
    !Number.isInteger(record.sequence) ||
    typeof record.sequence !== "number" ||
    record.sequence < 1
  ) {
    throw new TraceValidationError(`${path}.sequence must be a positive integer.`);
  }
  const parentEventId = record.parent_event_id;
  if (parentEventId !== undefined && parentEventId !== null && typeof parentEventId !== "string") {
    throw new TraceValidationError(`${path}.parent_event_id must be a string when present.`);
  }
  const call: ToolCall = {
    event_id: validateIdentifier(record.event_id, `${path}.event_id`),
    sequence: record.sequence,
    timestamp: normalizeUtcTimestamp(
      requiredString(record.timestamp, `${path}.timestamp`),
      `${path}.timestamp`,
    ),
    actor: validateContractActor(record.actor, `${path}.actor`),
    tool: validateContractTool(record.tool, `${path}.tool`),
    outcome: validateOutcome(record.outcome, `${path}.outcome`),
    side_effect: validateSideEffect(record.side_effect, `${path}.side_effect`),
    approval: validateContractApproval(record.approval, `${path}.approval`),
    requested_capabilities: validateCapabilities(
      record.requested_capabilities === undefined ? [] : record.requested_capabilities,
      `${path}.requested_capabilities`,
    ),
    input_labels: validateLabels(
      record.input_labels === undefined ? [] : record.input_labels,
      `${path}.input_labels`,
    ),
    output_labels: validateLabels(
      record.output_labels === undefined ? [] : record.output_labels,
      `${path}.output_labels`,
    ),
    attributes: cloneJsonObject(
      record.attributes === undefined ? {} : record.attributes,
      `${path}.attributes`,
      false,
    ),
  };
  return parentEventId === undefined || parentEventId === null
    ? call
    : { ...call, parent_event_id: validateIdentifier(parentEventId, `${path}.parent_event_id`) };
}

export function validateWorkflowTrace(value: unknown): WorkflowTrace {
  const record = expectRecord(value, "trace");
  rejectUnknownKeys(
    record,
    ["schema_version", "trace_id", "source", "recorded_at", "events", "metadata"],
    "trace",
  );
  const schemaVersion =
    record.schema_version === undefined ? SCHEMA_VERSION : record.schema_version;
  if (schemaVersion !== SCHEMA_VERSION) {
    throw new TraceValidationError("trace.schema_version must equal 1.0.");
  }
  if (!Array.isArray(record.events) || record.events.length === 0) {
    throw new TraceValidationError("trace.events must be a non-empty array.");
  }
  const events = record.events.map((event, index) =>
    validateContractToolCall(event, `trace.events[${String(index)}]`),
  );
  const seenEventIds = new Set<string>();
  for (const [index, event] of events.entries()) {
    if (event.sequence !== index + 1) {
      throw new TraceValidationError("trace.events must have contiguous sequences beginning at 1.");
    }
    if (seenEventIds.has(event.event_id)) {
      throw new TraceValidationError(`trace.events contains duplicate event_id ${event.event_id}.`);
    }
    if (event.parent_event_id === event.event_id) {
      throw new TraceValidationError("trace event may not be its own parent.");
    }
    if (event.parent_event_id !== undefined && !seenEventIds.has(event.parent_event_id)) {
      throw new TraceValidationError(
        "trace event parents must refer to an earlier event in the same trace.",
      );
    }
    seenEventIds.add(event.event_id);
  }
  const trace: WorkflowTrace = {
    schema_version: SCHEMA_VERSION,
    trace_id: validateIdentifier(record.trace_id, "trace.trace_id"),
    source: validateIdentifier(record.source, "trace.source"),
    recorded_at: normalizeUtcTimestamp(
      requiredString(record.recorded_at, "trace.recorded_at"),
      "trace.recorded_at",
    ),
    events,
    metadata: cloneJsonObject(
      record.metadata === undefined ? {} : record.metadata,
      "trace.metadata",
      false,
    ),
  };
  return deepFreeze(trace);
}

export function fingerprintWorkflowTrace(trace: WorkflowTrace): string {
  return sha256Hex(trace);
}

function cloneObservation(observation: ToolObservation): ToolObservation {
  const approval = observation.approval;
  const approvedBy = approval?.approvedBy;
  return {
    ...observation,
    actor: { ...observation.actor },
    tool: { ...observation.tool },
    ...(approval === undefined
      ? {}
      : {
          approval: {
            ...approval,
            ...(approvedBy === undefined ? {} : { approvedBy: { ...approvedBy } }),
          },
        }),
    ...(observation.requestedCapabilities === undefined
      ? {}
      : { requestedCapabilities: [...observation.requestedCapabilities] }),
    ...(observation.inputLabels === undefined ? {} : { inputLabels: [...observation.inputLabels] }),
    ...(observation.outputLabels === undefined
      ? {}
      : { outputLabels: [...observation.outputLabels] }),
  };
}

export class TraceRecorder {
  readonly #traceId: string;
  readonly #source: string;
  readonly #recordedAt: string;
  readonly #metadata: JsonObject;
  readonly #events: ToolCall[] = [];
  readonly #eventIds = new Set<string>();
  #sealed: WorkflowTrace | undefined;

  public constructor(options: TraceRecorderOptions) {
    this.#traceId = validateIdentifier(options.traceId, "traceId");
    this.#source = validateIdentifier(options.source, "source");
    this.#recordedAt = normalizeUtcTimestamp(options.recordedAt, "recordedAt");
    this.#metadata = mergeSdkMetadata(options.metadata);
  }

  public get isSealed(): boolean {
    return this.#sealed !== undefined;
  }

  public record(observation: ToolObservation): ToolCall {
    if (this.#sealed !== undefined) {
      throw new RecorderStateError("A sealed recorder cannot accept additional observations.");
    }
    const event = materializeObservation(cloneObservation(observation), this.#events.length + 1);
    if (this.#eventIds.has(event.event_id)) {
      throw new RecorderStateError(`Duplicate event_id: ${event.event_id}.`);
    }
    if (event.parent_event_id !== undefined && !this.#eventIds.has(event.parent_event_id)) {
      throw new RecorderStateError("parentEventId must refer to an earlier recorded event.");
    }
    this.#events.push(event);
    this.#eventIds.add(event.event_id);
    return deepFreeze({ ...event });
  }

  public seal(): WorkflowTrace {
    if (this.#sealed === undefined) {
      if (this.#events.length === 0) {
        throw new RecorderStateError(
          "A recorder requires at least one observed tool event to seal.",
        );
      }
      this.#sealed = validateWorkflowTrace({
        schema_version: SCHEMA_VERSION,
        trace_id: this.#traceId,
        source: this.#source,
        recorded_at: this.#recordedAt,
        events: this.#events,
        metadata: this.#metadata,
      });
    }
    return this.#sealed;
  }
}

export function withOutcome(observation: ToolObservation, outcome: EventOutcome): ToolObservation {
  return { ...cloneObservation(observation), outcome };
}

export function validateObservation(observation: ToolObservation): void {
  materializeObservation(cloneObservation(observation), 1);
}
