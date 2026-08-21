export const SCHEMA_VERSION = "1.0";
export const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export type ActorKind = "agent" | "human" | "service" | "system";
export type EventOutcome = "succeeded" | "failed" | "blocked" | "cancelled" | "unknown";
export type SideEffect = "none" | "read" | "write" | "irreversible";
export type ApprovalState = "not_required" | "pending" | "approved" | "denied" | "expired";
export type DataClassification = "public" | "internal" | "confidential" | "restricted";

export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export interface ActorRef {
  readonly actor_id: string;
  readonly kind: ActorKind;
  readonly display_name?: string;
}

export interface ToolRef {
  readonly server_id: string;
  readonly name: string;
  readonly version?: string;
}

export interface Approval {
  readonly state: ApprovalState;
  readonly approval_id?: string;
  readonly approved_by?: ActorRef;
}

export interface ToolCall {
  readonly event_id: string;
  readonly sequence: number;
  readonly timestamp: string;
  readonly actor: ActorRef;
  readonly tool: ToolRef;
  readonly outcome: EventOutcome;
  readonly side_effect: SideEffect;
  readonly parent_event_id?: string;
  readonly approval: Approval;
  readonly requested_capabilities: readonly string[];
  readonly input_labels: readonly DataClassification[];
  readonly output_labels: readonly DataClassification[];
  readonly attributes: JsonObject;
}

export interface WorkflowTrace {
  readonly schema_version: typeof SCHEMA_VERSION;
  readonly trace_id: string;
  readonly source: string;
  readonly recorded_at: string;
  readonly events: readonly ToolCall[];
  readonly metadata: JsonObject;
}

export interface ObservationActor {
  readonly actorId: string;
  readonly kind: ActorKind;
  readonly displayName?: string;
}

export interface ObservationTool {
  readonly serverId: string;
  readonly name: string;
  readonly version?: string;
}

export interface ObservationApproval {
  readonly state?: ApprovalState;
  readonly approvalId?: string;
  readonly approvedBy?: ObservationActor;
}

export interface ToolObservation {
  readonly eventId: string;
  readonly timestamp: string;
  readonly actor: ObservationActor;
  readonly tool: ObservationTool;
  readonly sideEffect: SideEffect;
  readonly outcome?: EventOutcome;
  readonly parentEventId?: string;
  readonly approval?: ObservationApproval;
  readonly requestedCapabilities?: readonly string[];
  readonly inputLabels?: readonly DataClassification[];
  readonly outputLabels?: readonly DataClassification[];
}

export interface TraceRecorderOptions {
  readonly traceId: string;
  readonly source: string;
  readonly recordedAt: string;
  readonly metadata?: JsonObject;
}
